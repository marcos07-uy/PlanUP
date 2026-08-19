# Estado actual y próxima sesión

## Última actualización

Fecha de contexto: 19 de agosto de 2026.

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
- PR #1 mergeada en `main`: `https://github.com/marcos07-uy/PlanUP/pull/1`, merge commit `ebd2aeb`.
- CI de PR con tests, typecheck, build, Terraform fmt/validate y `terraform plan` contra el estado remoto.
- Deploy de `main` con plan guardado, `terraform apply`, generación de variables del frontend desde outputs, build web, sincronización a S3 e invalidación de CloudFront.
- GitHub Actions asume mediante OIDC el role `planup-dev-github-actions`; no hay access keys ni secrets de AWS almacenados en GitHub.
- El trust OIDC usa el subject personalizado `repo:marcos07-uy@171387849/PlanUP@1338801998:environment:production`.
- Primer CI de `main` exitoso: run `32276924625`.
- Primer deploy completo exitoso: run `32276924657`.
- El deploy aplicó Terraform, publicó el frontend en `planup-web-dev-920250548109` e invalidó CloudFront.
- Verificación posterior al deploy: `https://planup.marcos-lucas.uy` respondió HTTP 200 desde CloudFront/S3 y el objeto fue actualizado el 19 de agosto de 2026 a las 16:38 UTC.
- Tests, build, typecheck, Terraform fmt/validate y prueba visual automatizada aprobados localmente.
- QA visual en `design-qa.md` con resultado `passed`.

## Qué no está hecho

- No se probó el flujo real completo con Cognito y DynamoDB desplegados.
- No hay backend de invitaciones o aprobación de entrenadores.
- No hay recuperación de contraseña en la interfaz.
- Hay pruebas unitarias de Lambda con una implementación DynamoDB en memoria, pero no pruebas de integración contra DynamoDB Local o AWS.
- No hay historial de cambios de sesiones.
- Los íconos PWA y el wordmark son provisionales; no se hizo un trabajo formal de identidad de marca.
- Las fuentes se cargan desde Google Fonts y aún no están alojadas dentro del proyecto.

## Orden recomendado para continuar

### 1. Enviar emails de Cognito desde el dominio de PlanUp

Reemplazar el remitente predeterminado `no-reply@verificationemail.com` por un remitente propio, por ejemplo `PlanUp <no-reply@planup.marcos-lucas.uy>`, usando Amazon SES.

Trabajo propuesto:

1. crear y verificar en SES la identidad `planup.marcos-lucas.uy` en `sa-east-1`;
2. publicar mediante Route53 los registros DKIM entregados por SES;
3. configurar un MAIL FROM propio, por ejemplo `mail.planup.marcos-lucas.uy`, con sus registros MX y SPF;
4. agregar una política DMARC para el dominio;
5. solicitar que SES salga del sandbox en `sa-east-1` antes de enviar a usuarios reales no verificados;
6. configurar el User Pool de Cognito con SES, `email_sending_account = "DEVELOPER"`, el ARN de la identidad verificada y el remitente de PlanUp;
7. personalizar el asunto y contenido del mensaje de confirmación para que coincidan con la marca;
8. probar registro, reenvío de código y recuperación de contraseña en proveedores como Gmail y Outlook;
9. comprobar en los encabezados recibidos que DKIM, SPF y DMARC pasan correctamente.

Implementar la identidad, los registros DNS y la configuración de Cognito en Terraform. No considerar esta tarea terminada únicamente porque cambió el texto visible del remitente: la autenticación del dominio y la salida del sandbox son necesarias para una entrega real confiable.

### 2. Hacer una prueba con dos cuentas reales

Usar un entrenador y un atleta con emails distintos. Validar alta, confirmación, vinculación, creación de sesión y lectura.

### 3. Endurecer el flujo de roles de usuario

Antes de invitar usuarios externos, impedir que cualquier persona se autodeclare entrenador. Una opción simple es que solo un administrador cree entrenadores.

### 4. Agregar recuperación de contraseña

Implementar en la interfaz el inicio y la confirmación del flujo de recuperación de contraseña de Cognito. Incluir este mensaje en las pruebas de entregabilidad de SES.

### 5. Ampliar las pruebas automatizadas

Agregar pruebas de integración contra DynamoDB Local o un entorno AWS controlado y cubrir el flujo real de autenticación, vinculación y sesiones.

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
gh run view 32276924625 -R marcos07-uy/PlanUP
gh run view 32276924657 -R marcos07-uy/PlanUP
```

Para comprobar rápidamente la aplicación desplegada:

```bash
curl -I https://planup.marcos-lucas.uy
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
- Dar al role OIDC permisos de apply sin limitar adecuadamente el repositorio y el contexto en su trust policy.
- El role de CI usa `PowerUserAccess` durante la fase DEV. Separar roles de plan y apply antes de sumar colaboradores o declarar producción.
- Aprobar un plan que destruya o reemplace recursos con datos persistentes.
- Enviar correos desde el dominio propio sin completar DKIM, SPF y DMARC, aumentando la probabilidad de spam o suplantación.
- Mantener SES en sandbox y asumir que podrá enviar códigos a cualquier dirección de usuario.
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
- Cognito envía desde el dominio de PlanUp y los mensajes pasan DKIM, SPF y DMARC;
- el proceso de despliegue real queda actualizado en esta documentación.
