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

## Datos demo en AWS DEV

El seed crea dos coaches (`coach.crossfit@example.com` y `coach.gym@example.com`), cuatro atletas por coach, dos grupos y dos programas de cuatro semanas por disciplina, 12 planificaciones por disciplina y 56 sesiones asignadas para una semana. Las cuentas se crean con emails reservados `@example.com`, marcados como verificados y sin enviar mensajes.

Antes de reiniciar los datos se puede auditar cuántos registros pertenecen a las identidades demo y cuántos fueron creados manualmente con esas cuentas:

```bash
AWS_PROFILE=personal npm run audit:demo
```

Revise primero el contenido sin modificar AWS:

```bash
npm run seed:demo:dry-run
```

Para cargar los datos en la cuenta DEV use el perfil `personal` y suministre una contraseña temporalmente mediante el entorno. La contraseña no se almacena en el repositorio:

```bash
AWS_PROFILE=personal PLANUP_DEMO_PASSWORD='CambiarEstaClave123' npm run seed:demo
```

El comando es idempotente: actualiza las cuentas demo y reemplaza solamente los registros marcados con `planup-demo-v1`. Para eliminar todo el dataset demo:

```bash
AWS_PROFILE=personal npm run cleanup:demo
```

La limpieza elimina tanto los registros del seed como los grupos, programas, planificaciones y asignaciones creados manualmente por las identidades demo. No elimina datos de usuarios reales.

El script se niega a modificar recursos que no correspondan al pool de `sa-east-1`, la tabla `planup-dev` y la cuenta AWS DEV esperada.

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

Terraform mantiene configurada la identidad de Amazon SES para `PlanUp <no-reply@planup.marcos-lucas.uy>`, con Easy DKIM, el MAIL FROM `mail.planup.marcos-lucas.uy`, SPF y DMARC en modo monitoreo (`p=none`). Cognito usa temporalmente su servicio de correo predeterminado para permitir registros durante DEV.

La solicitud para sacar SES del sandbox de `sa-east-1` fue respondida y el caso espera revisión de AWS. Mientras `ProductionAccessEnabled` sea `false`, `cognito_use_ses_email` debe permanecer en `false`. Consulte el estado con:

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
- El entrenador crea planificaciones reutilizables y las asigna por fecha a uno o varios atletas.
- El atleta consulta sus sesiones pasadas y futuras.
- Interfaz responsive e instalable en el celular.
