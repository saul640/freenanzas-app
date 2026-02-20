# desarrollador_logica_app

Construye la lógica de negocio de la aplicación, conecta la UI con el backend y gestiona los estados de la aplicación.

## Use this skill when
- Se necesita escribir la lógica central de la app (ej. cálculos financieros, calculadoras de inversión, carritos de compra).
- Hay que conectar los componentes visuales (UI) con las llamadas a la base de datos (Firebase).
- Se necesita gestionar el estado global o local de la aplicación (uso de Hooks en React).

## Do not use this skill when
- Solo se requiera hacer cambios cosméticos o estilísticos (usar experto UI/UX).
- Solo se necesiten configurar las reglas base de Firebase (usar arquitecto Firebase).

## Instructions

### Gestión de Estados (React)
- Utiliza `useState` y `useEffect` de forma limpia. Evita dependencias infinitas en los `useEffects`.
- Mantén estados separados para los datos, los errores y la carga (`data`, `loading`, `error`).

### Integración Segura
- Cuando obtengas datos de Firebase, incluye SIEMPRE bloques `try/catch` para manejar los errores y mostrarlos al usuario de forma amigable (no uses `alert()`, usa componentes tipo Toast o modales).
- Asegúrate de limpiar los listeners (como `onSnapshot` de Firestore) cuando los componentes se desmonten para evitar fugas de memoria.

### Arquitectura de Código Limpio
- Divide la lógica compleja en funciones pequeñas y reutilizables.
- Si la aplicación es financiera (basada en reglas como la 50-30-20), asegúrate de que los cálculos matemáticos sean precisos, validando que los inputs del usuario sean números correctos antes de procesarlos.
