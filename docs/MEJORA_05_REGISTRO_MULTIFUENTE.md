# Mejora 05 — importación y fuentes de movimientos

## Alcance entregado

La primera entrega incorpora importación CSV revisable desde **Movimientos → Importar CSV**. Usa la colección financiera existente `transactions`; no crea otra contabilidad. Los renglones permanecen como borradores locales durante la revisión y solo se guardan al confirmar. El servidor valida la identidad, la cuenta de tarjeta registrada, la zona horaria y cada fila; crea los movimientos y el historial del lote en una transacción de Firestore. Cada lote confirmado es idempotente y se puede deshacer o restaurar con los mismos identificadores.

La pantalla permite elegir cuenta/fuente, codificación UTF-8, Windows-1252 o ISO-8859-1, delimitador automático o coma, punto y coma, tabulador o barra vertical, mapeo de columnas, fecha ISO/DMY/MDY, punto/coma decimal e importe único o columnas débito/crédito. Tiene vista previa, corrección por fila, total por tipo, errores visibles, exclusiones explícitas y sugerencias de coincidencias. Una coincidencia nunca se descarta automáticamente. Si hay más de 5,000 movimientos previos que impiden completar la comprobación, el lote queda bloqueado hasta revisar el historial o reducir el alcance.

Se limitan los archivos a CSV de 5 MB y 100 filas por lote. La moneda importable es DOP porque el registro y el presupuesto actual operan en DOP; las otras monedas se señalan como error y no se convierten silenciosamente. Las transferencias y pagos entre cuentas no se importan como ingresos o gastos. Las coincidencias se muestran como posibles, incluso si comparten fecha e importe; el usuario decide si incluye cada fila.

El modelo actual solo ofrece tarjetas de crédito como cuentas registradas. Se pueden seleccionar esas tarjetas, o escribir el nombre de otra fuente. En este último caso el nombre es procedencia descriptiva; no crea una cuenta ni actualiza un saldo. No se modifican los saldos de tarjetas al importar compras históricas.

## Captura por foto/voz y conexión bancaria

La pantalla incluye la entrada voluntaria a foto/voz, con alternativas al formulario manual. La cámara solo se abre después de elegir un archivo. El micrófono solo se solicita al iniciar una grabación explícita, limitada a 60 segundos; al detener o cancelar, no se conserva ni se transmite el audio. Ambos adaptadores son simulaciones visibles: crean un borrador vacío para completar manualmente; no hay OCR ni transcripción activos, ni se afirma reconocimiento.

El adaptador bancario es una interfaz simulada y permanece desactivado. Prueba eventos ficticios repetidos, pendientes, contabilizados, retirados y paginados, sin crear transacciones financieras ni pedir credenciales.

La revisión oficial de la documentación de Plaid encontró que los códigos de país admitidos por su API de instituciones no incluyen `DO` (República Dominicana). Esto no prueba la cobertura de todos los proveedores; sí impide afirmar que Plaid soporte bancos dominicanos. No se incorporó proveedor real ni se solicitó acceso, contrato o credenciales.

## Límites conocidos

- La bandeja de revisión es para el lote CSV actual y el historial de importaciones; no consolida todavía movimientos manuales, predicciones recurrentes y propuestas bancarias/foto/voz en una única lista.
- Las coincidencias son sugerencias heurísticas; no existe conciliación persistente entre recibo, movimiento manual y banco, ni ciclo de vida completo de pendientes bancarios, devoluciones, comisiones, intereses o pagos de tarjeta.
- El sistema recurrente existente se conserva; esta entrega no modifica su modelo para moneda, cuenta, importe variable, fin de mes o ajuste de años bisiestos.
- Foto y voz necesitan evaluación y aprobación de un servicio antes de conectar OCR o transcripción reales.
- No existe una exportación CSV en el flujo agregado. `escapeCsvCell` se prueba como protección para futuras exportaciones; no altera las exportaciones XLSX/PDF existentes.
- La prueba de guardado usa transacciones simuladas en memoria. No se hizo una importación real en Firestore, prueba entre cuentas de usuarios reales ni evaluación de usabilidad. No se incorporaron datos ficticios al proyecto de producción.

## Verificación y despliegue

Verificación final en la rama de entrega:

- `npm test`: 38 pruebas Vitest y 3 pruebas adicionales de presupuesto, todas aprobadas.
- `npx eslint` sobre los archivos nuevos/modificados de interfaz, importación, adaptadores y pruebas: aprobado. `functions/index.js` presenta tres errores de configuración de globals (`process` y `Buffer`) en líneas preexistentes; el lint de Functions (`node --check`) sí pasa.
- `npm run build`: aprobado; Vite informó advertencias preexistentes de tamaño de bundle, datos de Browserslist antiguos y división de chunks.
- `cd functions && npm test`: 10 pruebas aprobadas; `npm run lint` (comprobación de sintaxis) aprobado.
- Lint completo del repositorio: falla por 23 errores y 1 advertencia en archivos de configuración/código existentes (incluye `AuthAction.jsx`, `gemini.js`, `errorReporting.js` y scripts). No se amplió esta entrega para corregir deuda ajena.
- Firebase CLI dry-run para Hosting y las cinco Functions de importación: aprobado en `freenanzas-app`. El dry-run no confirma una publicación ni una ejecución real contra Firestore.
- Publicación posterior: commit `c99629b` subido a `origin/main`; Firebase reportó `Deploy complete` para Hosting y `previewCsvImport`, `confirmCsvImport`, `listCsvImportBatches`, `undoCsvImportBatch` y `restoreCsvImportBatch` (Node.js 22, `us-central1`). La URL pública respondió HTTP 200 y el HTML sirvió el bundle de esta versión con la ruta de importación.
- Prueba básica posterior al despliegue: verificados el HTML y el asset JS públicos. No se ejecutó un lote autenticado de prueba ni se escribieron datos en producción; el backend se validó con pruebas simuladas.

El proyecto de destino configurado es `freenanzas-app` y la instancia Firestore elegida es `(default)`, Standard, ubicación `nam5`. No se requiere cambiar reglas de Firestore para esta entrega: los lotes solo los leen/escriben Functions con identidad autenticada y la lista se devuelve al propietario. El despliegue debe limitarse a Hosting y las Functions de importación; no despliega reglas de Firestore ni Storage.

**Estado:** primera entrega CSV implementada y probada técnicamente; desplegada en `https://freenanzas-app.web.app`; pendiente de validación con usuarios y de conciliación multifuente completa. OCR/transcripción reales e integración bancaria no están activos.
