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
3. Abra `app_url`.

El atleta debe registrarse e iniciar sesion al menos una vez antes de que un entrenador pueda vincularlo por email. Para limitar el costo, configure `billing_alert_email` en `terraform.tfvars`; Terraform creara alertas al 80% previsto y al 100% real del presupuesto mensual de USD 5.

## Alcance del MVP

- Registro e inicio de sesion como entrenador o atleta.
- Un entrenador vincula atletas registrados mediante su email.
- El entrenador crea, edita y elimina sesiones fechadas.
- El atleta consulta sus sesiones pasadas y futuras.
- Interfaz responsive e instalable en el celular.
