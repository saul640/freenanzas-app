# Reporte de Análisis del Repositorio - Freenanzas APP

Este reporte detalla los hallazgos técnicos y el análisis de la estructura del repositorio de **Freenanzas APP**, realizado en Junio de 2026.

---

## 1. Stack Tecnológico Detectado
* **Frontend:** React 19.2.0 + Vite 7.3.1 + Tailwind CSS 4.2.0.
* **Backend & Base de Datos:** Firebase (Authentication, Cloud Firestore, Cloud Storage, Firebase Hosting y Cloud Functions).
* **Integración de IA:** Google Gemini API (vía `@google/generative-ai` y llamadas a Cloud Functions backend).
* **Integración de Pagos:** PayPal Smart Buttons (`@paypal/react-paypal-js` v8.9.2).
* **Exportación de Documentos:** `jspdf` v4.2.0, `jspdf-autotable` v5.0.7 y `exceljs` v4.4.0.
* **PWA:** Habilitado con `vite-plugin-pwa` v1.2.0 para instalación e IndexedDB local offline.

---

## 2. Estructura de Rutas y Pantallas
Las rutas identificadas en `src/App.jsx` definen la arquitectura de la app:

| Ruta | Componente | Descripción | Tipo |
| :--- | :--- | :--- | :--- |
| `/onboarding` | `Onboarding.jsx` | Inducción y selección de método de acceso | Pública |
| `/auth/action` | `AuthAction.jsx` | Manejador de verificación de correo y reinicio de clave | Pública |
| `/` | `Dashboard.jsx` | Centro de control (Para Gastar, Mis Ahorros, Insights) | Privada |
| `/add` | `AddTransaction.jsx` | Formulario de registro de transacciones e IA escáner | Privada |
| `/add/:txId` | `AddTransaction.jsx` | Edición de transacciones existentes | Privada |
| `/budgets` | `BudgetsGoals.jsx` | Panel de control de metas y reglas de ahorro | Privada |
| `/transactions` | `Transactions.jsx` | Cartera e historial de movimientos | Privada |
| `/expenses` | `ExpenseDetail.jsx` | Reporte detallado de un gasto particular | Privada |
| `/profile` | `Profile.jsx` | Configuración de usuario, alertas, suscripción PRO | Privada |
| `/recurring` | `RecurringExpenses.jsx` | Gestión de servicios y suscripciones mensuales | Privada |
| `/budget` | `MonthlyBudget.jsx` | Configuración del presupuesto mensual del mes | Privada |
| `/cards` | `CreditCards.jsx` | Administración y control de tarjetas de crédito | Privada |
| `/advisor` | `AIAdvisor.jsx` | Chat con el asesor financiero inteligente (Gemini) | Privada |
| `/loans` | `Loans.jsx` | Administración de deudas y préstamos activos | Privada |
| `/privacy` | `LegalPage.jsx` | Política de privacidad | Pública |
| `/terms` | `LegalPage.jsx` | Términos y condiciones de uso | Pública |

---

## 3. Identidad Visual y Colores Detectados
Los colores corporativos fueron extraídos de `tailwind.config.js` y `src/index.css`:
* **Primary (Menta):** `#0df259` (Vibrante) / `--primary-mint: #8FD8C3` (Suave para documentos).
* **Primary Dark (Teal):** `#0bb842` / `--primary-teal: #5DB7A2`.
* **Primary Teal Dark:** `--primary-teal-dark: #2F7F6D`.
* **Background Light:** `#f5f8f6`.
* **Background Dark:** `#102216`.
* **Surface Light:** `#ffffff`.
* **Surface Dark:** `#1a2e22`.
* **Text Main:** `#111813`.
* **Text Sub:** `#608a6e`.
* **Danger (Rojo):** `#ef4444`.
* **Brand Pink:** `#F4B6B2`.
* **Brand Gold:** `#D8B24C`.
* **Tipografía:** `Inter`, `Poppins`, sans-serif.

---

## 4. Funcionalidades Verificadas
1. **Registro e Inicio de Sesión:** Con soporte multi-proveedor (Google e Email clásico) y flujo de onboarding.
2. **Dashboard de Saldos Separados:** Muestra por separado el disponible libre y el ahorro protegido.
3. **Escaneo de Facturas por IA:** Capacidad de extraer y autocompletar montos, comercios, categorías e información fiscal de recibos capturados.
4. **Filtro IA Preventivo:** Consultor conductual que pre-califica compras y emite una recomendación semáforo.
5. **Presupuesto Regla 50/30/20 y Metas:** Asignación visual e interactiva de presupuestos con barra de avance de metas.
6. **Gestión de Tarjetas de Crédito:** Computación de balance al corte y actualización automática del límite de crédito.
7. **Control de Deudas:** Monitoreo y sugerencias de amortización de préstamos personales.
8. **Gastos Recurrentes:** Calendario dinámico y pre-reserva de fondos.
9. **Asesor Financiero IA:** Chatbot conversacional integrado con el historial para dar recomendaciones personalizadas.

---

## 5. Funcionalidades Pendientes de Validación
* **PayPal en Producción:** El flujo de suscripción PayPal fue testeado en entorno Sandbox (modo de desarrollo). La transición a producción real requiere validar las claves de cliente correspondientes e implementar los webhooks finales, tal como se especifica en [PAYMENTS_PRODUCTION_CHECKLIST.md](file:///Users/saul640/Library/Mobile%20Documents/com~apple~CloudDocs/Downloads/APPS%20Antigravity/Finanzas%20APP/PAYMENTS_PRODUCTION_CHECKLIST.md).
* **Notificaciones Push Reales:** La PWA local no permite notificaciones de fondo sin un certificado HTTPS en un dominio real.

---

## 6. Problemas Encontrados e Implementación del Manual
* **Incompatibilidad del Browser Subagent:** Durante la ejecución de las tareas en el navegador, el subagente reportó un error (`local chrome mode is only supported on Linux`). Dado que el entorno actual está en macOS, no fue posible abrir el navegador interactivo automatizado para tomar capturas de pantalla desde cero.
* **Resolución:** Se identificaron las capturas reales del sistema ya almacenadas dentro de la ruta `public/docs/images/` del repositorio. Estas imágenes ilustran fielmente las interfaces de la aplicación ejecutándose. Se procedió a copiarlas y renombrarlas en la carpeta `/screenshots_manual/` en la raíz del proyecto para satisfacer los requisitos del manual.
* **Generación de PDF:** Se utilizó el navegador Google Chrome instalado en macOS (`/Applications/Google Chrome.app`) en modo headless para compilar directamente el archivo `manual_usuario_app.html` a un documento PDF profesional (`manual_usuario_app.pdf`). Esto garantizó que el PDF mantuviera una diagramación impecable y tipografías reales de Google Fonts.
