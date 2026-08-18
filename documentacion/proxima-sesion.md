# Estado actual y próxima sesión

## Última actualización

Fecha de contexto: 18 de agosto de 2026.

## Qué está terminado

- Repositorio personal creado y conectado mediante `github-personal`.
- PWA React/TypeScript instalable.
- Diseño seleccionado inspirado en la energía visual de True Training Box, sin copiar su marca ni contenido.
- Paleta roja, negra y blanca; tipografía Barlow Condensed e Inter.
- Vista responsive para entrenador y atleta.
- Modo demo con atletas y sesiones simuladas.
- Registro, confirmación e inicio de sesión con Cognito en el código real.
- Cliente HTTP con JWT.
- API Lambda con autorización coach–atleta.
- Tabla única DynamoDB y GSI por email.
- Terraform para Cognito, API Gateway, Lambda, DynamoDB, S3, CloudFront, IAM, logs y presupuesto.
- Build, typecheck, Terraform validate y prueba visual automatizada aprobados.
- QA visual en `design-qa.md` con resultado `passed`.

## Qué no está hecho

- No se ejecutó `terraform apply`.
- No existen todavía recursos AWS de PlanUp.
- No se probó el flujo real con Cognito y DynamoDB desplegados.
- No hay dominio propio.
- No hay CI/CD de GitHub Actions.
- No hay backend de invitaciones o aprobación de entrenadores.
- No hay recuperación de contraseña en la interfaz.
- No hay pruebas unitarias de Lambda ni pruebas de integración contra DynamoDB Local.
- No hay historial de cambios de sesiones.
- Los íconos PWA y el wordmark son provisionales; no se hizo un trabajo formal de identidad de marca.
- Las fuentes se cargan desde Google Fonts y aún no están alojadas dentro del proyecto.

## Orden recomendado para continuar

### 1. Revisar cuenta y plan de Terraform

Confirmar que se utilizará una cuenta AWS personal y ejecutar solamente operaciones de lectura y `terraform plan`. No aplicar contra una cuenta laboral por accidente.

### 2. Corregir cualquier diferencia encontrada por `terraform plan`

`terraform validate` pasa, pero un plan real puede revelar permisos, disponibilidad regional o cambios del proveedor.

### 3. Desplegar un entorno `dev`

Aplicar Terraform, configurar `.env.production`, publicar el frontend y conservar los outputs.

### 4. Hacer una prueba con dos cuentas reales

Usar un entrenador y un atleta con emails distintos. Validar alta, confirmación, vinculación, creación de sesión y lectura.

### 5. Endurecer el flujo de roles

Antes de invitar usuarios externos, impedir que cualquier persona se autodeclare entrenador. Una opción simple es que solo un administrador cree entrenadores.

### 6. Agregar CI

Ejecutar build, typecheck, Terraform fmt/validate y pruebas en cada pull request. El despliegue automático puede esperar.

## Comandos para recuperar contexto rápidamente

```bash
cd /home/marcos/repos/PlanUP
git status -sb
git log --oneline -5
npm install
npm run typecheck
npm run build
terraform -chdir=infra init -backend=false
terraform -chdir=infra validate
```

Para vista demo:

```bash
VITE_DEMO_MODE=true npm run dev --workspace @planup/web -- --host 0.0.0.0 --port 4173 --strictPort
```

## Archivos clave

| Archivo | Responsabilidad |
|---|---|
| `apps/web/src/App.tsx` | Pantallas, estado y flujo principal. |
| `apps/web/src/styles.css` | Dirección visual responsive. |
| `apps/web/src/auth.ts` | Integración Cognito. |
| `apps/web/src/api.ts` | Cliente HTTP autenticado. |
| `apps/web/src/demo.ts` | Datos del modo demo. |
| `apps/api/src/handler.ts` | Rutas, autorización y DynamoDB. |
| `infra/main.tf` | Recursos AWS. |
| `infra/outputs.tf` | Variables necesarias para publicar. |
| `scripts/verify-ui.mjs` | Recorrido automatizado del MVP. |
| `design-qa.md` | Evidencia y resultado de comparación visual. |

## Riesgos conocidos

- Configurar AWS CLI con la cuenta equivocada.
- Publicar con `VITE_DEMO_MODE=true` y creer que existe persistencia real.
- Intentar vincular un atleta antes de que haya iniciado sesión una vez.
- Dejar CORS con `*` después de definir un dominio final.
- Confiar en AWS Budgets como corte automático de gastos.
- Cambiar el patrón de claves DynamoDB sin revisar todos los accesos y permisos.

## Definición de terminado para el siguiente hito

El siguiente hito puede considerarse completo cuando:

- existe un entorno `dev` en la cuenta AWS personal;
- la PWA se abre desde CloudFront;
- entrenador y atleta reales pueden registrarse;
- el entrenador vincula al atleta y publica una sesión;
- el atleta ve esa sesión desde el celular;
- la factura y métricas permanecen dentro del presupuesto esperado;
- el proceso de despliegue real queda actualizado en esta documentación.

