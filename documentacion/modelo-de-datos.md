# Modelo de datos DynamoDB

## Tabla única

La tabla usa las claves:

- `PK`: partition key.
- `SK`: sort key.
- `GSI1PK` y `GSI1SK`: índice secundario para búsqueda de usuarios por email.

## Entidades

### Perfil de usuario

```json
{
  "PK": "USER#<cognito-sub>",
  "SK": "PROFILE",
  "entityType": "USER",
  "id": "<cognito-sub>",
  "email": "atleta@example.com",
  "name": "Sofía Rodríguez",
  "role": "athlete",
  "GSI1PK": "EMAIL#atleta@example.com",
  "GSI1SK": "USER#<cognito-sub>",
  "updatedAt": "2026-08-18T20:00:00.000Z"
}
```

El endpoint `GET /me` hace un `PutItem` idempotente para mantener este perfil sincronizado con Cognito.

### Relación entrenador–atleta

```json
{
  "PK": "COACH#<coach-sub>",
  "SK": "ATHLETE#<athlete-sub>",
  "entityType": "COACH_ATHLETE",
  "coachId": "<coach-sub>",
  "athleteId": "<athlete-sub>",
  "name": "Sofía Rodríguez",
  "email": "atleta@example.com",
  "createdAt": "2026-08-18T20:00:00.000Z"
}
```

Nombre y email están duplicados intencionalmente para listar atletas con una sola consulta. Si el atleta cambia esos datos, actualmente la relación no se actualiza automáticamente.

### Sesión

```json
{
  "PK": "ATHLETE#<athlete-sub>",
  "SK": "SESSION#2026-08-18",
  "entityType": "SESSION",
  "athleteId": "<athlete-sub>",
  "coachId": "<coach-sub>",
  "date": "2026-08-18",
  "content": "CALENTAMIENTO\n...\n\nFUERZA\n...\n\nWOD\n...",
  "updatedAt": "2026-08-18T20:00:00.000Z"
}
```

Hay como máximo una sesión por atleta y fecha. Un `PutItem` sobre la misma clave reemplaza el contenido anterior.

## Patrones de acceso

| Necesidad | Operación DynamoDB |
|---|---|
| Obtener perfil | `GetItem(USER#id, PROFILE)`; actualmente `/me` usa `PutItem` directo. |
| Buscar usuario por email | `Query GSI1` con `GSI1PK = EMAIL#email`. |
| Listar atletas de un coach | `Query PK = COACH#coach` y `begins_with(SK, ATHLETE#)`. |
| Verificar vínculo | `GetItem(COACH#coach, ATHLETE#athlete)`. |
| Listar sesiones por fechas | `Query PK = ATHLETE#athlete`, `SK BETWEEN SESSION#from AND SESSION#to`. |
| Guardar sesión | `PutItem(ATHLETE#athlete, SESSION#date)`. |
| Eliminar sesión | `DeleteItem(ATHLETE#athlete, SESSION#date)`. |

No se utiliza `Scan`. Esto mantiene bajo el consumo de lecturas aunque crezca la tabla.

## Restricciones actuales

- No existe historial de versiones de una sesión.
- No hay una invitación pendiente: el vínculo aparece inmediatamente.
- Un atleta podría estar vinculado con varios entrenadores.
- No existe relación inversa almacenada bajo `ATHLETE#id`; para el MVP no es necesaria.
- No se aplican TTL ni borrado automático.
- El contenido de sesión se limita a 20.000 caracteres en Lambda.

