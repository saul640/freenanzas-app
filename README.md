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

## Arquitectura de Datos (Firestore)

| Ruta | Descripción |
|------|-------------|
| `/transactions/{id}` | Transacciones globales (filtradas por `userId`) |
| `/users/{uid}/` | Perfil del usuario |
| `/users/{uid}/creditCards/` | Tarjetas de crédito |
| `/users/{uid}/recurring/` | Gastos recurrentes |
| `/users/{uid}/categories/` | Categorías personalizadas |
| `/users/{uid}/budgets/` | Presupuestos mensuales |
