# arquitecto_firebase_backend

Configura, gestiona y asegura la base de datos en Firestore, la autenticación de usuarios y el despliegue en Firebase Hosting.

## Use this skill when
- Se necesita configurar o inicializar un proyecto de Firebase en la aplicación.
- Se requiere crear o modificar la estructura de la base de datos en Firestore (colecciones y documentos).
- El usuario pide implementar inicio de sesión (Authentication) o reglas de seguridad.
- Hay que preparar la aplicación para ser desplegada en Firebase Hosting.

## Do not use this skill when
- El usuario pide cambiar el color de un botón, la tipografía o el diseño visual (para esto usa el skill de UI/UX).
- Se requiere escribir pruebas unitarias o hacer debugging de la interfaz.

## Instructions

### Inicialización y Autenticación
- Asegúrate de que Firebase se inicialice correctamente antes de cualquier operación.
- Implementa siempre la autenticación (ej. correo/contraseña o Google) ANTES de intentar leer o escribir en la base de datos.
- Maneja los estados de autenticación (usuario logueado, cargando, no logueado).

### Estructura de Firestore
- Diseña bases de datos NoSQL eficientes. Evita la anidación profunda de colecciones; prefiere colecciones de nivel raíz referenciadas por IDs (ej. `users/{userId}/transacciones`).
- Nunca utilices consultas complejas (como múltiples `where` o `orderBy` combinados) a menos que hayas planificado la creación de los índices necesarios.

### Reglas de Seguridad
- Asegúrate de incluir reglas de seguridad de Firestore en el proyecto.
- Por defecto, un usuario solo debe poder leer y escribir sus propios documentos: `allow read, write: if request.auth != null && request.auth.uid == userId;`

### Despliegue (Hosting)
- Configura el archivo `firebase.json` y `.firebaserc` de manera correcta.
- Asegúrate de que las rutas de construcción (ej. `build` o `dist`) coincidan con la configuración del hosting.
