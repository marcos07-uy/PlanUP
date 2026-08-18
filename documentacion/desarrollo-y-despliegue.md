# Desarrollo y despliegue

## Requisitos

- Node.js 20 o superior.
- npm.
- Terraform 1.6 o superior.
- AWS CLI configurada con una cuenta autorizada.
- Credenciales AWS con permisos para crear los recursos definidos en `infra`.

## Instalación

Desde la raíz del repositorio:

```bash
npm install
```

El repositorio usa npm workspaces para `apps/web` y `apps/api`.

## Ejecutar la PWA en modo demo

```bash
cp apps/web/.env.example apps/web/.env
npm run dev
```

`apps/web/.env.example` ya propone `VITE_DEMO_MODE=true`.

Variables disponibles:

```dotenv
VITE_API_URL=https://example.execute-api.us-east-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=us-east-1_example
VITE_COGNITO_CLIENT_ID=example
VITE_DEMO_MODE=true
```

## Validaciones locales

```bash
npm run typecheck
npm run build
node scripts/verify-ui.mjs
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra validate
git diff --check
```

`scripts/verify-ui.mjs` espera que la PWA demo esté escuchando en `127.0.0.1:4173`. Prueba:

- navegación por fechas;
- estado sin sesión;
- retorno a una sesión existente;
- apertura del editor;
- guardado;
- mensaje de éxito;
- errores de página y consola.

## Primer despliegue AWS

No se ha ejecutado todavía. Antes de continuar, confirmar que AWS CLI apunta a la cuenta personal deseada:

```bash
aws sts get-caller-identity
```

Crear configuración local:

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars
```

Editar como mínimo:

```hcl
aws_region          = "us-east-1"
environment         = "dev"
billing_alert_email = "email-personal@example.com"
```

Construir Lambda y revisar infraestructura:

```bash
npm run build --workspace @planup/api
terraform -chdir=infra init
terraform -chdir=infra plan
```

Solo después de revisar el plan:

```bash
terraform -chdir=infra apply
```

## Configurar y publicar frontend

Después del `apply`, Terraform imprime `frontend_env`. Copiar su contenido a:

```text
apps/web/.env.production
```

Luego compilar y publicar:

```bash
npm run build --workspace @planup/web
aws s3 sync apps/web/dist s3://<output-web_bucket> --delete
aws cloudfront create-invalidation --distribution-id <distribution-id> --paths '/*'
```

El output `deploy_frontend_commands` entrega los mismos comandos con los valores reales del bucket y la distribución.

## Prueba funcional después del despliegue

1. Abrir `app_url`.
2. Registrar una cuenta atleta y confirmar su email.
3. Iniciar sesión como atleta al menos una vez.
4. Registrar una cuenta entrenador con otro email.
5. Vincular el email del atleta.
6. Crear una sesión para hoy.
7. Cerrar sesión e ingresar como atleta.
8. Confirmar que la sesión se ve y no puede editarse.
9. Revisar métricas de Lambda, API Gateway y DynamoDB.
10. Confirmar la suscripción por email a AWS Budgets si AWS la solicita.

## Costos y cuidados

- No hay recursos AWS mientras no se ejecute `terraform apply`.
- CloudFront, Lambda, Cognito y DynamoDB tienen niveles gratuitos amplios para este MVP, pero el costo nunca debe asumirse como cero.
- AWS Budgets alerta; no detiene automáticamente los servicios.
- Route 53 y un dominio propio no están incluidos todavía.
- Point-in-time recovery de DynamoDB está habilitado por seguridad y puede tener costo según uso.
- Revisar siempre `terraform plan` y la identidad AWS antes de aplicar.

## Destruir el entorno

La destrucción elimina datos y debe hacerse únicamente si el entorno deja de ser necesario y existe respaldo de cualquier información importante:

```bash
terraform -chdir=infra destroy
```

No ejecutar este comando de forma automática en una sesión futura.
