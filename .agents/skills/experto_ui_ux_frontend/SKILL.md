# experto_ui_ux_frontend

Crea interfaces de usuario modernas, responsivas y accesibles utilizando Tailwind CSS y principios de diseño premium.

## Use this skill when
- El usuario solicita diseñar la interfaz visual de la aplicación.
- Hay que hacer que la aplicación sea responsiva (adaptable a móviles, tablets y escritorio).
- Se necesita mejorar la experiencia del usuario (animaciones, estados de carga, microinteracciones).
- El usuario pide implementar Tailwind CSS.

## Do not use this skill when
- Se deban crear consultas a la base de datos o configurar servidores.
- Se requiera realizar pruebas de estrés de la lógica de negocio.

## Instructions

### Diseño Mobile-First
- Comienza siempre diseñando para pantallas pequeñas (móviles) y utiliza los prefijos de Tailwind (`md:`, `lg:`, `xl:`) para escalar el diseño hacia pantallas más grandes.
- Evita los anchos o altos fijos (`w-[500px]`); utiliza medidas relativas (`w-full`, `max-w-md`, `h-auto`) para evitar que el diseño se rompa.

### Estética y Jerarquía Visual
- Utiliza esquemas de colores cohesivos (ej. paletas neutras para el fondo con acentos de color para los botones de acción principal).
- Aplica esquinas redondeadas (`rounded-lg`, `rounded-xl`), sombras sutiles (`shadow-md`, `shadow-sm`) y abundante espacio en blanco (`p-4`, `gap-6`) para lograr un aspecto premium y moderno.
- Diferencia claramente los encabezados del cuerpo del texto mediante el grosor de la fuente y el contraste de colores (ej. `text-gray-900` vs `text-gray-500`).

### Feedback Interactivo (UX)
- Todo elemento interactivo (botones, enlaces, tarjetas) debe tener estados `hover:`, `focus:`, y `active:` visibles y satisfactorios (ej. `transition-colors duration-200`).
- Implementa "Skeleton loaders" o spinners atractivos mientras los datos cargan desde la base de datos.
