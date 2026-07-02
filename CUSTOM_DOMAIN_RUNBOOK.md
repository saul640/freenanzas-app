# Runbook de Dominio Propio

Usa este runbook cuando compres el dominio público de Freenanzas. No abras cobros al público hasta que el dominio esté activo con HTTPS, PayPal y App Check actualizados.

## Dominio recomendado

- Dominio primario: `freenanzas.com`
- App pública: `https://app.freenanzas.com` o `https://freenanzas.com`
- Soporte: `saul640@gmail.com`

Elige un dominio primario y mantén el otro como redirección para evitar confundir a PayPal, Firebase Auth, App Check y soporte.

## Firebase Hosting

1. Abre Firebase Console > Hosting > Add custom domain.
2. Agrega el dominio elegido.
3. Crea los registros DNS que Firebase indique.
4. Espera a que Firebase emita el certificado SSL.
5. Verifica que el dominio sirva la app y no muestre errores de certificado.

Comandos de verificación:

```bash
dig +short freenanzas.com
dig +short app.freenanzas.com
curl -I https://freenanzas.com
curl -I https://app.freenanzas.com
```

La respuesta esperada debe incluir `HTTP/2 200` o una redirección HTTPS intencional hacia el dominio primario.

## Firebase Auth

Agrega el dominio público en Firebase Console > Authentication > Settings > Authorized domains.

Dominios a revisar:

- `freenanzas.com`
- `app.freenanzas.com`
- `freenanzas-app.web.app`
- `freenanzas-app.firebaseapp.com`

Después prueba registro, inicio de sesión y recuperación de contraseña desde el dominio nuevo.

## Firebase App Check

En Firebase Console > App Check, agrega el dominio nuevo a la configuración de reCAPTCHA Enterprise usada por la app web.

Verifica:

- La app carga sin errores de App Check.
- Las Cloud Functions callable siguen respondiendo desde el dominio nuevo.
- No aparecen errores `unauthorized-domain` o `app-check` en consola.

## PayPal

Actualiza la app live de PayPal:

- Return URL del dominio nuevo, si aplica.
- Webhook live activo.
- Enlaces de plan/fallback que apunten a los planes live correctos.
- Branding público con el dominio y correo de soporte reales.

Webhook recomendado:

```text
https://us-central1-freenanzas-app.cloudfunctions.net/paypalWebhook
```

Si mantienes el webhook de Cloud Functions, no necesitas cambiarlo al comprar dominio propio. Sí debes probar eventos reales después del cambio.

## Variables de Entorno

Actualiza los valores de producción antes de desplegar:

```bash
PAYPAL_ENV=live
VITE_PAYPAL_CLIENT_ID=<client-id-live>
VITE_PAYPAL_PLAN_ID_MONTHLY=<plan-live-mensual>
VITE_PAYPAL_PLAN_ID_ANNUAL=<plan-live-anual>
VITE_PAYPAL_FALLBACK_MONTHLY=<link-live-mensual>
VITE_PAYPAL_FALLBACK_ANNUAL=<link-live-anual>
```

Luego ejecuta:

```bash
PAYPAL_ENV=live npm run verify:payments
npm run build
firebase deploy --only hosting --project freenanzas-app
```

## Evidencia Mínima

Guarda en `PAYMENTS_PRODUCTION_CHECKLIST.md`:

- Captura de Firebase Hosting con dominio conectado y SSL activo.
- Resultado de `curl -I` del dominio primario.
- Captura de Firebase Auth con dominio autorizado.
- Captura de App Check/reCAPTCHA Enterprise con dominio autorizado.
- Captura de PayPal app/webhook revisados.
- Compra mensual live desde el dominio nuevo.
- Compra anual live desde el dominio nuevo.
- Webhook real recibido después del cambio.
