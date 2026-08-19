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
- Estado remoto Terraform en S3: `planup-backend`, key `planup/dev/terraform.tfstate`.
- Entorno `dev` aplicado en AWS.
- Dominio propio configurado: `https://planup.marcos-lucas.uy`.
- API desplegada: `https://dzivf9kcm8.execute-api.sa-east-1.amazonaws.com`.
- Cognito User Pool: `sa-east-1_svr1LdPh2`.
- Bucket frontend: `planup-web-dev-920250548109`.
- PR abierta en draft: `https://github.com/marcos07-uy/PlanUP/pull/1`, rama `agent/deploy-planup-aws`.
- CI de PR con tests, typecheck, build, Terraform fmt/validate y `terraform plan` contra el estado remoto.
- Deploy de `main` con plan guardado, `terraform apply`, generación de variables del frontend desde outputs, build web, sincronización a S3 e invalidación de CloudFront.
- El deploy usa el environment de GitHub `production` para permitir required reviewers antes de acceder a AWS.
- Último commit de continuidad: `7a706a9 Add planned infrastructure and frontend deployment`.
- Tests, build, typecheck, Terraform fmt/validate y prueba visual automatizada aprobados localmente.
- QA visual en `design-qa.md` con resultado `passed`.

## Qué no está hecho

- El nuevo CI remoto no llega todavía a `terraform plan`: falla en `Configure AWS credentials` porque `AWS_ROLE_ARN` no está disponible para el job.
- Falta configurar el trust OIDC del role AWS para el repositorio y los eventos que ejecutarán plan/apply.
- La cuenta activa de `gh` durante la última sesión fue `marcos-ecom`; puede leer la PR pública, pero recibió HTTP 403 al intentar listar secrets de `marcos07-uy/PlanUP`. Para configurar GitHub hay que autenticarse con una cuenta administradora del repositorio.
- No se probó el flujo real completo con Cognito y DynamoDB desplegados.
- No hay backend de invitaciones o aprobación de entrenadores.
- No hay recuperación de contraseña en la interfaz.
- Hay pruebas unitarias de Lambda con una implementación DynamoDB en memoria, pero no pruebas de integración contra DynamoDB Local o AWS.
- No hay historial de cambios de sesiones.
- Los íconos PWA y el wordmark son provisionales; no se hizo un trabajo formal de identidad de marca.
- Las fuentes se cargan desde Google Fonts y aún no están alojadas dentro del proyecto.

## Orden recomendado para continuar

### 1. Desbloquear OIDC en GitHub Actions

Autenticarse en `gh` con una cuenta administradora de `marcos07-uy/PlanUP`. En el environment `production`, configurar:

- secret `AWS_ROLE_ARN` con el ARN del role asumible mediante GitHub OIDC;
- variable opcional `AWS_REGION=sa-east-1`;
- required reviewers para exigir aprobación manual.

Verificar en AWS que el trust policy del role acepte el repositorio `marcos07-uy/PlanUP` y el contexto usado por los workflows. El role también necesita acceso al backend S3 y permisos suficientes para plan/apply y para sincronizar S3 e invalidar CloudFront.

### 2. Reejecutar y revisar el plan de la PR

Reejecutar el workflow fallido `32207926470` o empujar un commit vacío. Confirmar que `Terraform plan` finaliza correctamente y revisar que no proponga destrucciones inesperadas. La PR debe permanecer en draft hasta completar esta revisión.

### 3. Probar el deploy completo

Después del merge, aprobar el environment `production` y comprobar que el workflow:

1. crea y aplica el plan guardado;
2. genera `apps/web/.env.production` desde `terraform output -raw frontend_env`;
3. construye el frontend;
4. sincroniza `apps/web/dist` al bucket indicado por `web_bucket`;
5. crea la invalidación para `cloudfront_distribution_id`.

### 4. Hacer una prueba con dos cuentas reales

Usar un entrenador y un atleta con emails distintos. Validar alta, confirmación, vinculación, creación de sesión y lectura.

### 5. Endurecer el flujo de roles

Antes de invitar usuarios externos, impedir que cualquier persona se autodeclare entrenador. Una opción simple es que solo un administrador cree entrenadores.

## Comandos para recuperar contexto rápidamente

```bash
cd /home/marcos/repos/PlanUP
git status -sb
git log --oneline -5
npm ci
npm test
npm run typecheck
npm run build
terraform -chdir=infra init -backend=false
terraform -chdir=infra validate
gh auth status
gh pr view 1 -R marcos07-uy/PlanUP
gh run view 32207926470 -R marcos07-uy/PlanUP
```

Después de configurar `AWS_ROLE_ARN`, para reejecutar el CI fallido:

```bash
gh run rerun 32207926470 -R marcos07-uy/PlanUP
gh run watch 32207926470 -R marcos07-uy/PlanUP --exit-status
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
| `.github/workflows/ci.yml` | Verificación de PR, autenticación OIDC y Terraform plan. |
| `.github/workflows/terraform-apply.yml` | Apply, build web, sincronización S3 e invalidación CloudFront. |
| `infra/main.tf` | Composición de módulos AWS. |
| `infra/outputs.tf` | Variables necesarias para publicar. |
| `scripts/verify-ui.mjs` | Recorrido automatizado del MVP. |
| `design-qa.md` | Evidencia y resultado de comparación visual. |

## Riesgos conocidos

- Configurar AWS CLI con la cuenta equivocada.
- Configurar el secret en el repositorio pero no en el environment correcto, o viceversa.
- Dar al role OIDC permisos de apply sin limitar adecuadamente el repositorio y el contexto en su trust policy.
- Aprobar un plan que destruya o reemplace recursos con datos persistentes.
- Publicar con `VITE_DEMO_MODE=true` y creer que existe persistencia real.
- Intentar vincular un atleta antes de que haya iniciado sesión una vez.
- Dejar CORS con `*` después de definir un dominio final.
- Confiar en AWS Budgets como corte automático de gastos.
- Cambiar el patrón de claves DynamoDB sin revisar todos los accesos y permisos.

## Definición de terminado para el siguiente hito

El siguiente hito puede considerarse completo cuando:

- existe un entorno `dev` en la cuenta AWS personal;
- la PWA se abre desde `https://planup.marcos-lucas.uy`;
- entrenador y atleta reales pueden registrarse;
- el entrenador vincula al atleta y publica una sesión;
- el atleta ve esa sesión desde el celular;
- la factura y métricas permanecen dentro del presupuesto esperado;
- el CI de la PR ejecuta un plan real exitoso;
- el deploy de `main` aplica el plan y publica automáticamente el frontend;
- el proceso de despliegue real queda actualizado en esta documentación.
