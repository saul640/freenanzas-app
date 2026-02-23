import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatMoney } from './format'

/**
 * Exporta una lista de transacciones a un archivo PDF bien formateado.
 * @param {Array} transactions - Lista de transacciones a exportar (ya filtradas).
 * @param {string} [title='Reporte de Gastos'] - Título del reporte.
 */
export const exportExpensesToPdf = (transactions, title = 'Reporte de Gastos') => {
    const doc = new jsPDF()
    const today = new Date()
    const dateStr = today.toLocaleDateString('es-DO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    })

    // ─── Header ───
    doc.setFontSize(20)
    doc.setTextColor(17, 24, 19) // text-main color
    doc.text(title, 14, 22)

    doc.setFontSize(10)
    doc.setTextColor(96, 138, 110) // text-sub color
    doc.text(`Generado el ${dateStr}`, 14, 30)
    doc.text(`Total de transacciones: ${transactions.length}`, 14, 36)

    // ─── Summary ───
    const totalExpense = transactions
        .filter((tx) => tx.type === 'expense')
        .reduce((sum, tx) => sum + (tx.amount || 0), 0)
    const totalIncome = transactions
        .filter((tx) => tx.type === 'income')
        .reduce((sum, tx) => sum + (tx.amount || 0), 0)

    doc.setFontSize(11)
    doc.setTextColor(17, 24, 19)
    doc.text(`Total Ingresos: RD$ ${formatMoney(totalIncome)}`, 14, 44)
    doc.text(`Total Gastos: RD$ ${formatMoney(totalExpense)}`, 14, 50)
    doc.text(`Balance: RD$ ${formatMoney(totalIncome - totalExpense)}`, 14, 56)

    // ─── Table ───
    const tableData = transactions.map((tx) => {
        const rawDate = tx.timestamp?.toDate
            ? tx.timestamp.toDate()
            : tx.date
                ? new Date(tx.date + 'T12:00:00')
                : null

        return [
            rawDate
                ? rawDate.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'Sin fecha',
            tx.type === 'expense' ? 'Gasto' : 'Ingreso',
            tx.category || 'Sin categoría',
            `RD$ ${formatMoney(tx.amount || 0)}`,
            tx.note || '—',
        ]
    })

    autoTable(doc, {
        startY: 62,
        head: [['Fecha', 'Tipo', 'Categoría', 'Monto', 'Nota']],
        body: tableData,
        styles: {
            fontSize: 9,
            cellPadding: 3,
            font: 'helvetica',
        },
        headStyles: {
            fillColor: [13, 242, 89], // primary color
            textColor: [17, 24, 19],
            fontStyle: 'bold',
        },
        alternateRowStyles: {
            fillColor: [245, 248, 246], // background-light
        },
        columnStyles: {
            3: { halign: 'right' },
        },
    })

    // ─── Download ───
    const fileName = `Reporte_Gastos_${today.toISOString().slice(0, 10)}.pdf`
    doc.save(fileName)
}
