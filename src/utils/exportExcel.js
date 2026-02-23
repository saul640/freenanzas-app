import * as XLSX from 'xlsx'

/**
 * Exporta una lista de transacciones a un archivo Excel (.xlsx).
 * Los montos se guardan como números para facilitar cálculos.
 * @param {Array} transactions - Lista de transacciones a exportar (ya filtradas).
 * @param {string} [sheetName='Gastos'] - Nombre de la hoja.
 */
export const exportExpensesToExcel = (transactions, sheetName = 'Gastos') => {
    const today = new Date()

    // ─── Preparar datos ───
    const rows = transactions.map((tx) => {
        const rawDate = tx.timestamp?.toDate
            ? tx.timestamp.toDate()
            : tx.date
                ? new Date(tx.date + 'T12:00:00')
                : null

        return {
            Fecha: rawDate
                ? rawDate.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'Sin fecha',
            Tipo: tx.type === 'expense' ? 'Gasto' : 'Ingreso',
            Categoría: tx.category || 'Sin categoría',
            'Monto (RD$)': tx.amount || 0,
            Nota: tx.note || '',
            Comercio: tx.merchant || '',
        }
    })

    // ─── Crear workbook y hoja ───
    const worksheet = XLSX.utils.json_to_sheet(rows)

    // Ajustar ancho de columnas
    worksheet['!cols'] = [
        { wch: 16 }, // Fecha
        { wch: 10 }, // Tipo
        { wch: 20 }, // Categoría
        { wch: 15 }, // Monto
        { wch: 25 }, // Nota
        { wch: 20 }, // Comercio
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

    // ─── Download ───
    const fileName = `Reporte_Gastos_${today.toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(workbook, fileName)
}
