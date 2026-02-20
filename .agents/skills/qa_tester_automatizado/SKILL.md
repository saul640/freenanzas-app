# qa_tester_automatizado

Prueba la aplicación, busca errores lógicos o visuales, valida casos extremos y garantiza un funcionamiento impecable antes de dar el proyecto por terminado.

## Use this skill when
- El usuario pide "probar la aplicación", "buscar errores" o "asegurarse de que funciona".
- Se ha terminado una nueva funcionalidad y necesita validación antes de pasar a la siguiente.
- Hay un error (bug) reportado y se necesita analizar el código para encontrar la causa raíz y proponer una solución.

## Do not use this skill when
- Se está planificando el diseño inicial de la aplicación.
- Se está escribiendo la estructura de la base de datos desde cero.

## Instructions

### El Ciclo de Prueba y Error (Loop de Debugging)
- Ejecuta revisiones mentales y estáticas del código. Revisa: ¿Qué pasa si el usuario no tiene internet? ¿Qué pasa si el input está vacío? ¿Qué pasa si Firebase devuelve un error de permisos?
- Si encuentras un fallo, explícalo brevemente, aplica la solución en el código y vuelve a evaluar el resultado.

### Validación de Casos Extremos (Edge Cases)
- **Estados Vacíos (Empty States)**: Verifica que la app muestre mensajes amigables si no hay datos, no pantallas en blanco.
- **Responsividad Crítica**: Valida el comportamiento en pantallas pequeñas (ej. iPhone SE) buscando desbordamientos (overflow) horizontales.

### Auditoría de Rendimiento y Recursos
- Asegúrate de que no haya variables no utilizadas, bucles infinitos por re-renders o llamadas API innecesarias.
- **Optimización de Lectura**: Confirma que no se lean colecciones completas sin necesidad; prioriza la paginación si el volumen de datos es alto.

### Aprobación Final
- No des una funcionalidad por terminada hasta verificar que cumple con funcionalidad, diseño y manejo elegante de errores.
