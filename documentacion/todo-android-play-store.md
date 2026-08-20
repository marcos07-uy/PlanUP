# TODO: Android y publicación en Google Play

## Estado y decisión

- Estado: **postergado**.
- Prioridad actual: completar y estabilizar las funcionalidades del desarrollo inicial de PlanUp.
- Retomar este roadmap cuando el MVP web esté funcionalmente cerrado.
- Enfoque elegido: empaquetar la PWA existente como una **Trusted Web Activity (TWA)** con Bubblewrap.
- No se planea reescribir PlanUp en Kotlin ni adoptar Capacitor mientras no necesitemos capacidades nativas como notificaciones push, sensores, ejecución en segundo plano o integración profunda con el dispositivo.

La TWA conservará `https://planup.marcos-lucas.uy` como aplicación real. El wrapper Android será pequeño y las actualizaciones ordinarias del frontend seguirán llegando mediante el CI/CD actual de S3 y CloudFront, sin publicar una nueva versión Android por cada cambio web.

## Prerrequisitos de producto y políticas

Antes de enviar la aplicación a Google Play:

- [ ] Cerrar las funcionalidades y pruebas del MVP web.
- [ ] Implementar una opción dentro de PlanUp para solicitar o ejecutar la eliminación de la cuenta y sus datos.
- [ ] Publicar una página web accesible sin iniciar sesión para solicitar la eliminación de cuenta.
- [ ] Definir retención y eliminación de perfiles, relaciones, planificaciones y sesiones en Cognito y DynamoDB.
- [ ] Publicar una política de privacidad con URL estable.
- [ ] Publicar datos de soporte: email, nombre del desarrollador y página de contacto.
- [ ] Documentar qué datos personales recoge PlanUp y con qué finalidad.
- [ ] Completar en Play Console el formulario **Data safety** de acuerdo con el comportamiento real de Cognito, DynamoDB, CloudWatch y cualquier servicio futuro.
- [ ] Revisar permisos y dependencias para declarar únicamente los necesarios.
- [ ] Reservar las cuentas demo como credenciales para la revisión de Google Play y mantenerlas funcionales durante el proceso.

## Cuenta de Google Play

- [ ] Crear una cuenta en Google Play Console.
- [ ] Elegir conscientemente entre cuenta personal y de organización.
- [ ] Pagar el registro único de USD 25.
- [ ] Completar la verificación de identidad, contacto y dispositivo Android solicitada por Google.
- [ ] Si se usa una organización, disponer de un número D-U-N-S y datos legales consistentes.
- [ ] Definir el nombre público del desarrollador.

Si la cuenta personal fue creada después del 13 de noviembre de 2023:

- [ ] Seleccionar al menos 15 o 16 testers para mantener un margen sobre el mínimo.
- [ ] Confirmar que por lo menos 12 utilizan una cuenta Google y aceptan la prueba cerrada.
- [ ] Mantener al menos 12 testers inscritos durante 14 días consecutivos.
- [ ] Recoger feedback y registrar qué se probó y qué se corrigió.
- [ ] Solicitar acceso a producción una vez cumplido el período.

Los testers pueden ser amigos, familiares, entrenadores, atletas o colaboradores elegidos por el propietario. La prueba cerrada no vuelve pública la aplicación.

## Proyecto Android en el repositorio

- [ ] Crear un directorio `android/` versionado en este repositorio.
- [ ] Generar el wrapper TWA mediante Bubblewrap usando el manifest de la PWA.
- [ ] Definir el application/package ID definitivo, tentativamente `uy.marcoslucas.planup`.
- [ ] Configurar el nombre PlanUp, URL inicial, orientación y colores.
- [ ] Reemplazar los íconos y el splash provisionales por recursos finales de marca.
- [ ] Configurar `minSdkVersion` y `targetSdkVersion` vigentes.
- [ ] Para envíos desde el 31 de agosto de 2026, apuntar como mínimo a Android 16 / API 36.
- [ ] Compilar un APK de desarrollo y probarlo en teléfono y emulador.
- [ ] Verificar login, registro, confirmación, recuperación de contraseña y persistencia de sesión con Cognito dentro de la TWA.
- [ ] Verificar navegación, botón atrás, teclado, rotación, modo offline y actualización del service worker.
- [ ] Verificar tamaños de pantalla y accesibilidad en Android.

## Asociación entre la app y el dominio

- [ ] Crear la clave de upload fuera del repositorio.
- [ ] No guardar el keystore ni sus contraseñas en Git.
- [ ] Activar Play App Signing.
- [ ] Obtener la huella SHA-256 del certificado final de firma administrado por Google Play.
- [ ] Crear `apps/web/public/.well-known/assetlinks.json` con el package ID y la huella correcta.
- [ ] Publicarlo en `https://planup.marcos-lucas.uy/.well-known/assetlinks.json` mediante el pipeline existente.
- [ ] Verificar que CloudFront lo entregue con HTTP 200 y un tipo de contenido apropiado.
- [ ] Validar Digital Asset Links en una instalación proveniente de Google Play.
- [ ] Confirmar que la aplicación abre como TWA sin barra de Custom Tab; una barra visible suele indicar que falló la asociación.

Durante desarrollo puede ser necesario declarar también la huella de la clave local. La publicación final debe incluir la huella del certificado de **App Signing**, no asumir que coincide con la clave de upload.

## Build, CI/CD y secretos

- [ ] Generar un Android App Bundle firmado (`.aab`).
- [ ] Mantener `versionCode` incremental y una estrategia clara de `versionName`.
- [ ] Agregar al CI validación del proyecto Android en cada PR.
- [ ] Agregar un workflow manual o por tag para generar releases Android.
- [ ] Guardar keystore, alias y contraseñas en GitHub Secrets o en un sistema de secretos adecuado.
- [ ] Evitar imprimir secretos o material de firma en logs.
- [ ] Conservar el despliegue web actual como fuente de actualizaciones ordinarias de la TWA.
- [ ] Publicar un nuevo AAB solo cuando cambien wrapper, SDK objetivo, manifest, permisos, íconos o configuración nativa.
- [ ] Evaluar más adelante automatizar el upload a Play Console con una service account de permisos mínimos.

## Ficha de Play Store

- [ ] Preparar nombre, descripción breve y descripción completa en español.
- [ ] Crear ícono de alta resolución, feature graphic y capturas de teléfono.
- [ ] Definir categoría, audiencia, países y clasificación de contenido.
- [ ] Declarar si contiene anuncios; inicialmente debería ser “no”.
- [ ] Vincular política de privacidad, soporte y eliminación de cuenta.
- [ ] Completar Data safety sin asumir que usar HTTPS equivale a no recoger datos.
- [ ] Proporcionar a revisión una cuenta coach demo y, si es útil, una cuenta atleta demo.
- [ ] Confirmar que las credenciales demo no expiran y que el entorno DEV permanecerá disponible durante la revisión.

## Secuencia de publicación

1. Finalizar MVP web y resolver requisitos de eliminación y privacidad.
2. Crear y verificar la cuenta Play Console.
3. Generar el proyecto TWA y probar un APK local.
4. Configurar firma, Play App Signing y Digital Asset Links.
5. Generar y subir el primer AAB a **Internal testing**.
6. Corregir problemas de instalación, autenticación, navegación y políticas.
7. Preparar la ficha y pasar a **Closed testing**.
8. Mantener 12 testers durante 14 días si aplica a la cuenta.
9. Solicitar acceso a producción y responder las preguntas de Google.
10. Publicar gradualmente y monitorear Android Vitals, errores y feedback.

## Costos previstos

- Registro de Play Console: USD 25, pago único.
- Publicaciones y actualizaciones: sin costo por release de Google Play.
- Infraestructura: la TWA no agrega servidores; continúa usando Cognito, API Gateway, Lambda, DynamoDB, S3 y CloudFront.
- Costos potenciales futuros: diseño gráfico, dominio/soporte, observabilidad, notificaciones push o servicios nativos adicionales.

## Cuándo reconsiderar Capacitor o una app nativa

Revisar la decisión TWA si PlanUp necesita:

- notificaciones push con comportamiento nativo avanzado;
- sensores, cámara, Bluetooth o integración con wearables;
- sincronización compleja en segundo plano;
- funcionamiento offline con escritura y reconciliación extensa;
- widgets, deep links avanzados o integraciones del sistema;
- una experiencia que ya no pueda expresarse adecuadamente como aplicación web.

## Definición de terminado

Este trabajo estará terminado cuando:

- [ ] la aplicación se instale desde Google Play y abra en pantalla completa como TWA verificada;
- [ ] registro, login, recuperación y eliminación de cuenta funcionen en Android;
- [ ] entrenador y atleta completen sus recorridos principales;
- [ ] política de privacidad, Data safety y eliminación de cuenta estén aprobadas;
- [ ] el AAB use API objetivo vigente y Play App Signing;
- [ ] el período de pruebas exigido esté completo;
- [ ] la release de producción esté aprobada y monitoreada;
- [ ] el procedimiento de nuevas versiones esté documentado y reproducible.

## Fuentes oficiales para revisar al retomar

- Trusted Web Activities: <https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities>
- Quick start de Bubblewrap/TWA: <https://developer.chrome.com/docs/android/trusted-web-activity/quick-start>
- Registro de Play Console: <https://support.google.com/googleplay/android-developer/answer/6112435>
- Requisitos de pruebas para cuentas personales: <https://support.google.com/googleplay/android-developer/answer/14151465>
- Requisitos de API objetivo: <https://support.google.com/googleplay/android-developer/answer/11926878>
- Firma de aplicaciones: <https://developer.android.com/studio/publish/app-signing>
- Eliminación de cuentas: <https://support.google.com/googleplay/android-developer/answer/13327111>
- Data safety: <https://support.google.com/googleplay/android-developer/answer/10787469>

Los requisitos de Google Play cambian con frecuencia. Antes de comenzar la implementación hay que volver a validar estas fuentes y actualizar fechas, niveles de API y políticas.
