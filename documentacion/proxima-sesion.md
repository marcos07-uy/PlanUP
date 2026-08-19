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
- Build, typecheck, Terraform validate y prueba visual automatizada aprobados.
- QA visual en `design-qa.md` con resultado `passed`.

## Qué no está hecho

- No se publicó todavía el build web real en el bucket S3 después del apply, salvo que se hayan ejecutado los comandos de deploy manual.
- No se probó el flujo real completo con Cognito y DynamoDB desplegados.
- No hay CI/CD de GitHub Actions listo para aplicar infraestructura.
- No hay backend de invitaciones o aprobación de entrenadores.
- No hay recuperación de contraseña en la interfaz.
- No hay pruebas unitarias de Lambda ni pruebas de integración contra DynamoDB Local.
- No hay historial de cambios de sesiones.
- Los íconos PWA y el wordmark son provisionales; no se hizo un trabajo formal de identidad de marca.
- Las fuentes se cargan desde Google Fonts y aún no están alojadas dentro del proyecto.

## Orden recomendado para continuar

### 1. Configurar y publicar el frontend

Crear `apps/web/.env.production` con los valores reales del entorno `dev`, compilar y sincronizar `apps/web/dist` al bucket S3.

### 2. Hacer una prueba con dos cuentas reales

Usar un entrenador y un atleta con emails distintos. Validar alta, confirmación, vinculación, creación de sesión y lectura.

### 3. Endurecer el flujo de roles

Antes de invitar usuarios externos, impedir que cualquier persona se autodeclare entrenador. Una opción simple es que solo un administrador cree entrenadores.

### 4. Agregar CI

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

Para publicar el frontend del entorno `dev`:

```bash
cat > apps/web/.env.production <<'EOF'
VITE_API_URL=https://dzivf9kcm8.execute-api.sa-east-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=sa-east-1_svr1LdPh2
VITE_COGNITO_CLIENT_ID=76m5o9gka2j55kbkuu3dep1j4l
VITE_DEMO_MODE=false
EOF

npm run build --workspace @planup/web
aws s3 sync apps/web/dist s3://planup-web-dev-920250548109 --delete
aws cloudfront create-invalidation --distribution-id E1V1H6JQTHD2VW --paths '/*'
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
- la PWA se abre desde `https://planup.marcos-lucas.uy`;
- entrenador y atleta reales pueden registrarse;
- el entrenador vincula al atleta y publica una sesión;
- el atleta ve esa sesión desde el celular;
- la factura y métricas permanecen dentro del presupuesto esperado;
- el proceso de despliegue real queda actualizado en esta documentación.
