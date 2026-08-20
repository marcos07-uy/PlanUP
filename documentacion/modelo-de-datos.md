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

La relación inversa permite que el atleta liste y seleccione sus coaches:

```json
{
  "PK": "ATHLETE#<athlete-sub>",
  "SK": "COACH#<coach-sub>",
  "entityType": "ATHLETE_COACH",
  "athleteId": "<athlete-sub>",
  "coachId": "<coach-sub>",
  "name": "Marcos",
  "email": "coach@example.com",
  "createdAt": "2026-08-18T20:00:00.000Z"
}
```

### Invitación de coach

```json
{
  "PK": "ATHLETE#<athlete-sub>",
  "SK": "INVITATION#<coach-sub>",
  "entityType": "COACH_INVITATION",
  "athleteId": "<athlete-sub>",
  "coachId": "<coach-sub>",
  "name": "Marcos",
  "email": "coach@example.com",
  "createdAt": "2026-08-18T20:00:00.000Z"
}
```

Aceptar crea las dos relaciones y elimina la invitación. Rechazar solamente elimina la invitación.

### Sesión

```json
{
  "PK": "ATHLETE#<athlete-sub>",
  "SK": "SESSION#<coach-sub>#2026-08-18",
  "entityType": "SESSION",
  "athleteId": "<athlete-sub>",
  "coachId": "<coach-sub>",
  "date": "2026-08-18",
  "title": "Fuerza y AMRAP",
  "content": "CALENTAMIENTO\n...\n\nFUERZA\n...\n\nWOD\n...",
  "contentFormat": "text-v1",
  "status": "completed",
  "executionVersion": 2,
  "startedAt": "2026-08-18T19:00:00.000Z",
  "completedAt": "2026-08-18T20:00:00.000Z",
  "result": {
    "metrics": [{ "id": "load", "type": "weight", "label": "Front squat", "value": 90, "unit": "kg" }],
    "rpe": 8,
    "comment": "Buena sesión"
  },
  "updatedAt": "2026-08-18T20:00:00.000Z"
}
```

Hay como máximo una sesión por combinación de atleta, coach y fecha. Dos coaches pueden planificar el mismo día sin sobrescribirse. La API también lee temporalmente el formato anterior `SESSION#fecha` y lo atribuye mediante `coachId`.

El estado puede ser `pending`, `in_progress`, `completed` o `skipped`. Una sesión antigua sin estado se interpreta como `pending`. Sólo el atleta propietario puede actualizar la ejecución y sus resultados. `executionVersion` evita que dos dispositivos sobrescriban cambios y `lastMutationId` permite repetir una solicitud de forma idempotente.

### Planificación reutilizable del entrenador

```json
{
  "PK": "COACH#<coach-sub>",
  "SK": "COACH_SESSION#2026-08-18#<uuid>",
  "entityType": "COACH_SESSION",
  "id": "<uuid>",
  "coachId": "<coach-sub>",
  "title": "Fuerza y AMRAP",
  "date": "2026-08-18",
  "content": "==warmup\n...\n\n==wod\n...",
  "summary": "warmup ... wod ...",
  "updatedAt": "2026-08-18T20:00:00.000Z"
}
```

La fecha identifica cuándo se creó la planificación y forma parte de su clave. No limita su reutilización: al asignarla, la API recibe una fecha de destino independiente. Una sesión pendiente existente sólo se reemplaza después de confirmación; una sesión iniciada, completada u omitida nunca se sobrescribe. El resumen, limitado a 180 caracteres, alimenta las tarjetas sin enviar el contenido completo.

## Patrones de acceso

| Necesidad | Operación DynamoDB |
|---|---|
| Obtener perfil | `GetItem(USER#id, PROFILE)`; actualmente `/me` usa `PutItem` directo. |
| Buscar usuario por email | `Query GSI1` con `GSI1PK = EMAIL#email`. |
| Listar atletas de un coach | `Query PK = COACH#coach` y `begins_with(SK, ATHLETE#)`. |
| Listar coaches de un atleta | `Query PK = ATHLETE#athlete`, rango `COACH#` a `COACH#~`. |
| Listar invitaciones | `Query PK = ATHLETE#athlete`, rango `INVITATION#` a `INVITATION#~`. |
| Verificar vínculo | `GetItem(COACH#coach, ATHLETE#athlete)` o su relación inversa. |
| Listar planificaciones del coach | `Query PK = COACH#coach`, orden descendente, `Limit` máximo 50 y `ExclusiveStartKey` proveniente de un cursor opaco. |
| Obtener una planificación | `GetItem(COACH#coach, COACH_SESSION#date#id)`. |
| Asignar planificación | `GetItem` de la planificación, validación de vínculos y un `PutItem` por atleta/fecha. |
| Listar sesiones por coach y fechas | `Query PK = ATHLETE#athlete`, `SK BETWEEN SESSION#coach#from AND SESSION#coach#to`. |
| Guardar sesión | `PutItem(ATHLETE#athlete, SESSION#coach#date)`. |
| Eliminar sesión | `DeleteItem(ATHLETE#athlete, SESSION#coach#date)`. |

No se utiliza `Scan`. Esto mantiene bajo el consumo de lecturas aunque crezca la tabla.

## Restricciones actuales

- No existe historial de versiones de una sesión.
- La invitación aparece dentro de PlanUp, pero todavía no genera una notificación adicional por email.
- No existe todavía una acción para desvincular un coach aceptado.
- No se aplican TTL ni borrado automático.
- El contenido de sesión se limita a 20.000 caracteres en Lambda.
