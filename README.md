# Freenanzas – App de Finanzas Personales

**URL de Producción:** [https://freenanzas-app.web.app](https://freenanzas-app.web.app)

App de finanzas personales construida con React + Vite, Firebase (Auth, Firestore, Hosting, Functions) y Gemini AI.

## Stack Tecnológico

- **Frontend:** React 19 + Vite + Tailwind CSS
- **Backend:** Firebase (Firestore, Auth, Hosting, Cloud Functions)
- **IA:** Google Gemini vía Firebase Cloud Functions
- **PWA:** Vite PWA Plugin

## Desarrollo Local

```bash
npm install
npm --prefix functions install
npm run dev
```

Configura Gemini únicamente como secreto del backend:

```bash
npx firebase-tools functions:secrets:set GEMINI_API_KEY
```

## Despliegue

```bash
npm run build
npx firebase-tools deploy --only hosting,functions,firestore:rules,storage
```

Aplica CORS al bucket de Storage después del primer deploy o cuando cambie `storage.cors.json`:

```bash
gcloud storage buckets update gs://freenanzas-app.firebasestorage.app --cors-file=storage.cors.json
# Alternativa:
gsutil cors set storage.cors.json gs://freenanzas-app.firebasestorage.app
```

## Pagos en Producción

Antes de vender al público, completa y conserva evidencia de la checklist en
[PAYMENTS_PRODUCTION_CHECKLIST.md](PAYMENTS_PRODUCTION_CHECKLIST.md). Incluye
planes reales de PayPal, evento real de webhook, prueba de cancelación/reactivación,
recibo o comprobante y dominio propio.

Para conectar dominio propio, sigue [CUSTOM_DOMAIN_RUNBOOK.md](CUSTOM_DOMAIN_RUNBOOK.md)
y vuelve a probar PayPal, Firebase Auth y App Check desde el dominio final.

Valida la configuración local de producción antes de desplegar:

```bash
PAYPAL_ENV=live npm run verify:payments
```

El verificador no imprime credenciales ni IDs completos; solo confirma presencia,
formato esperado y consistencia básica con la UI y Cloud Functions.

## Arquitectura de Datos (Firestore)

| Ruta | Descripción |
|------|-------------|
| `/transactions/{id}` | Transacciones globales (filtradas por `userId`) |
| `/users/{uid}/` | Perfil del usuario |
| `/users/{uid}/creditCards/` | Tarjetas de crédito |
| `/users/{uid}/recurring/` | Gastos recurrentes |
| `/users/{uid}/categories/` | Categorías personalizadas |
| `/users/{uid}/budgets/` | Presupuestos mensuales |
