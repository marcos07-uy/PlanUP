# Funcionamiento del sistema

## Roles

### Entrenador

Puede:

- registrarse y confirmar su email;
- iniciar sesión;
- recuperar su contraseña mediante un código enviado por email;
- ver atletas vinculados;
- vincular un atleta registrado mediante su email;
- consultar todas sus planificaciones guardadas;
- reutilizar una planificación en cualquier fecha y asignarla a uno o más atletas;
- consultar sesiones del atleta por rango de fechas;
- crear o reemplazar una sesión para una fecha;
- eliminar una sesión.

### Atleta

Puede:

- registrarse y confirmar su email;
- iniciar sesión;
- recuperar su contraseña mediante un código enviado por email;
- consultar únicamente sus propias sesiones;
- navegar entre fechas.

El atleta no puede modificar sesiones ni consultar datos de otros atletas.

## Flujo de alta y vinculación

```mermaid
sequenceDiagram
    participant A as Atleta
    participant W as PWA
    participant C as Cognito
    participant API as API/Lambda
    participant D as DynamoDB
    participant E as Entrenador

    A->>W: Se registra como athlete
    W->>C: signUp(email, password, custom:role)
    C-->>A: Envía código por email
    A->>W: Confirma el código e inicia sesión
    W->>API: GET /me con JWT
    API->>D: Crea o actualiza USER#athlete / PROFILE
    E->>W: Ingresa email del atleta
    W->>API: POST /athletes
    API->>D: Busca EMAIL#email en GSI1
    API->>D: Crea COACH#coach / ATHLETE#athlete
    API-->>W: Devuelve atleta vinculado
```

El atleta debe iniciar sesión al menos una vez antes de ser vinculado. `GET /me` crea su perfil consultable por email en DynamoDB.

## Recuperación de contraseña

Desde el inicio de sesión, el usuario selecciona **Olvidé mi contraseña**, ingresa su email y recibe un código de Cognito. Luego informa ese código y una contraseña nueva que cumpla la política del User Pool. Cognito valida el código y actualiza la contraseña sin intervención de la API ni de DynamoDB.

La interfaz responde de forma genérica al solicitar el código para no revelar si una dirección está registrada. Mientras SES permanezca en sandbox, el email de recuperación solo puede enviarse a destinatarios permitidos por SES.

## Flujo de programación

1. La PWA carga la biblioteca completa de planificaciones del entrenador.
2. El entrenador puede crear una planificación reutilizable o seleccionar una existente.
3. Elige una fecha de destino y uno o más atletas vinculados.
4. La API valida todos los vínculos y copia la planificación a cada atleta en la fecha elegida.
5. Si ya existía una sesión para un atleta en esa fecha, la asignación reemplaza su contenido.
6. También puede seleccionar un atleta y editar directamente su sesión diaria.

El contenido reconoce encabezados `CALENTAMIENTO`, `FUERZA` y `WOD` para presentarlos como bloques visuales. La base de datos conserva el texto completo, por lo que no depende de esa estructura.

## Endpoints

Todos requieren un JWT de Cognito.

| Método | Ruta | Rol | Función |
|---|---|---|---|
| `GET` | `/me` | Ambos | Devuelve identidad y crea/actualiza el perfil DynamoDB. |
| `GET` | `/athletes` | Entrenador | Lista atletas vinculados. |
| `POST` | `/athletes` | Entrenador | Vincula un atleta registrado por email. |
| `GET` | `/athletes/{id}/sessions?from=&to=` | Ambos | Lista sesiones autorizadas en un rango. |
| `PUT` | `/athletes/{id}/sessions/{date}` | Entrenador | Crea o reemplaza la sesión fechada. |
| `DELETE` | `/athletes/{id}/sessions/{date}` | Entrenador | Elimina una sesión. |

## Autorización

```mermaid
flowchart TD
    R[Solicitud con JWT] --> J{JWT válido}
    J -->|No| X[401 en API Gateway]
    J -->|Sí| I[Lambda extrae sub, email, name y custom:role]
    I --> M{Operación}
    M -->|Perfil propio| OK[Permitir]
    M -->|Lista o escritura| C{Es coach}
    C -->|No| F[403]
    C -->|Sí| L{Existe vínculo coach-atleta}
    L -->|No| F
    L -->|Sí| OK
    M -->|Lectura de atleta| A{Es el atleta o coach vinculado}
    A -->|No| F
    A -->|Sí| OK
```

## Modo demo

Con `VITE_DEMO_MODE=true`, la PWA evita Cognito y la API. Usa datos definidos en `apps/web/src/demo.ts`. Sirve para diseño, pruebas visuales y desarrollo sin crear recursos AWS.

El modo demo permite:

- ver dos atletas simulados;
- navegar fechas;
- observar sesiones y estados vacíos;
- editar y guardar una sesión en memoria;
- comprobar la adaptación móvil y de escritorio.

Los cambios se pierden al recargar la página.
