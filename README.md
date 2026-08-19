# PlanUp

PWA serverless para que entrenadores programen sesiones y sus atletas las consulten desde cualquier dispositivo.

La documentación técnica y la guía para retomar el proyecto se encuentran en [`documentacion/`](documentacion/README.md).

## Arquitectura

- React + TypeScript + Vite como PWA.
- Amazon Cognito para autenticacion.
- API Gateway HTTP API + AWS Lambda.
- Amazon DynamoDB con una unica tabla.
- S3 privado + CloudFront para publicar el frontend.
- Terraform para administrar la infraestructura.

## Desarrollo local

Requisitos: Node.js 20+, npm y Terraform 1.6+.

```bash
npm install
cp apps/web/.env.example apps/web/.env
npm run dev
```

La interfaz puede ejecutarse con datos de demostracion usando `VITE_DEMO_MODE=true`.

## Infraestructura

```bash
## Desde la raiz, genera la Lambda que Terraform empaqueta
npm run build --workspace @planup/api

cd infra
terraform init
terraform plan
terraform apply
```

Luego de aplicar Terraform:

1. Copie el output `frontend_env` a `apps/web/.env.production`.
2. Ejecute los comandos del output `deploy_frontend_commands`.
3. Abra `app_url`: `https://planup.marcos-lucas.uy`.

El atleta debe registrarse e iniciar sesion al menos una vez antes de que un entrenador pueda vincularlo por email. Para limitar el costo, configure `billing_alert_email` en `terraform.tfvars`; Terraform creara alertas al 80% previsto y al 100% real del presupuesto mensual de USD 5.

## Email transaccional

Terraform configura Amazon SES y Cognito para enviar verificaciones desde `PlanUp <no-reply@planup.marcos-lucas.uy>`. La identidad usa Easy DKIM, el MAIL FROM `mail.planup.marcos-lucas.uy`, SPF y una politica DMARC inicialmente en modo monitoreo (`p=none`).

La solicitud para sacar SES del sandbox de `sa-east-1` fue enviada el 19 de agosto de 2026 y permanece pendiente de revision por AWS. Mientras `ProductionAccessEnabled` sea `false`, SES solo puede enviar a destinatarios verificados. Consulte el estado con:

```bash
aws sesv2 get-account --profile personal --region sa-east-1
```

## CI/CD

GitHub Actions ejecuta tests, typecheck, build, validacion y `terraform plan` contra el estado remoto en PRs. Al mergear a `main`, el workflow `Terraform Apply` genera un plan guardado, lo aplica usando OIDC contra AWS, construye el frontend con los outputs resultantes, sincroniza los archivos con S3 e invalida CloudFront.

Configure estos valores en GitHub antes de habilitar deploy:

- Variable `AWS_REGION`: region AWS, por defecto `sa-east-1`.

El ARN del role OIDC no es secreto y se declara directamente en los workflows. Terraform administra el role `planup-dev-github-actions` y limita su trust al subject personalizado de GitHub `repo:marcos07-uy@171387849/PlanUP@1338801998:environment:production`, que identifica al repositorio y al environment `production` mediante sus IDs estables.

Los jobs de plan y apply usan el environment `production`. Configure required reviewers en las deployment protection rules de ese environment para exigir aprobacion manual antes de acceder a AWS.

El backend remoto se define en `infra/backend.tf`. El plan de CI usa ese estado para detectar cambios reales antes del merge; para validaciones locales sin estado remoto puede usar `terraform -chdir=infra init -backend=false`.

## Alcance del MVP

- Registro e inicio de sesion como entrenador o atleta.
- Un entrenador vincula atletas registrados mediante su email.
- El entrenador crea, edita y elimina sesiones fechadas.
- El atleta consulta sus sesiones pasadas y futuras.
- Interfaz responsive e instalable en el celular.
