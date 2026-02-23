import ExcelJS from 'exceljs';

/**
 * Exporta transacciones a un archivo Excel profesional con estilos, formato condicional,
 * y una hoja de resumen tipo dashboard.
 * @param {Array} transactions - Lista de transacciones
 * @param {string} [sheetName='Detalle'] - Nombre de la hoja de detalle
 */
export const exportExpensesToExcel = async (transactions, sheetName = 'Detalle') => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Freenanzas App';
    workbook.created = new Date();

    const today = new Date();
    const dateStr = today.toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });

    // ─── Colors & Styles ───
    const PRIMARY = '0DF259';
    const HEADER_BG = '1F2937';
    const HEADER_FG = 'FFFFFF';
    const INCOME_BG = 'E6FCEB';
    const EXPENSE_BG = 'FEE2E2';
    const ALT_ROW = 'F9FAFB';

    const headerFont = { bold: true, size: 11, color: { argb: HEADER_FG } };
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    const headerAlignment = { horizontal: 'center', vertical: 'middle' };
    const currencyFormat = '#,##0.00';

    // ═══════════════════════════════
    // HOJA 1: RESUMEN
    // ═══════════════════════════════
    const summary = workbook.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
    summary.columns = [
        { width: 5 }, { width: 25 }, { width: 18 }, { width: 18 }, { width: 18 },
    ];

    // Title row
    summary.mergeCells('B2:E2');
    const titleCell = summary.getCell('B2');
    titleCell.value = 'REPORTE FINANCIERO';
    titleCell.font = { bold: true, size: 20, color: { argb: HEADER_BG } };
    titleCell.alignment = { horizontal: 'left' };

    summary.mergeCells('B3:E3');
    const dateCell = summary.getCell('B3');
    dateCell.value = `Generado: ${dateStr}`;
    dateCell.font = { size: 10, color: { argb: '9CA3AF' } };

    // Calculate totals
    let totalIncome = 0, totalExpense = 0;
    const catMap = {};
    transactions.forEach(tx => {
        if (tx.type === 'income') totalIncome += tx.amount;
        else {
            totalExpense += tx.amount;
            const cat = tx.category || 'Otros';
            catMap[cat] = (catMap[cat] || 0) + tx.amount;
        }
    });
    const balance = totalIncome - totalExpense;

    // Summary cards
    const addSummaryCard = (row, label, value, color) => {
        summary.mergeCells(`B${row}:C${row}`);
        const labelCell = summary.getCell(`B${row}`);
        labelCell.value = label;
        labelCell.font = { bold: true, size: 12, color: { argb: '6B7280' } };
        const valCell = summary.getCell(`D${row}`);
        valCell.value = value;
        valCell.numFmt = currencyFormat;
        valCell.font = { bold: true, size: 14, color: { argb: color } };
        valCell.alignment = { horizontal: 'right' };
    };

    addSummaryCard(5, 'Ingresos Totales', totalIncome, '22C55E');
    addSummaryCard(6, 'Gastos Totales', totalExpense, 'EF4444');
    addSummaryCard(7, 'Balance', balance, balance >= 0 ? '22C55E' : 'EF4444');

    // Category breakdown header
    const catHeaderRow = 9;
    summary.getCell(`B${catHeaderRow}`).value = 'DESGLOSE POR CATEGORÍA';
    summary.getCell(`B${catHeaderRow}`).font = { bold: true, size: 12, color: { argb: HEADER_BG } };

    const catTableHeader = catHeaderRow + 1;
    ['', 'Categoría', 'Monto (RD$)', '% del Total'].forEach((h, i) => {
        const cell = summary.getCell(catTableHeader, i + 1);
        cell.value = h;
        if (i > 0) { cell.font = headerFont; cell.fill = headerFill; cell.alignment = headerAlignment; }
    });

    const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    sortedCats.forEach(([cat, amount], i) => {
        const row = catTableHeader + 1 + i;
        const pct = totalExpense > 0 ? ((amount / totalExpense) * 100).toFixed(1) : '0.0';
        summary.getCell(row, 2).value = cat;
        summary.getCell(row, 2).font = { bold: true, size: 11 };
        summary.getCell(row, 3).value = amount;
        summary.getCell(row, 3).numFmt = currencyFormat;
        summary.getCell(row, 3).alignment = { horizontal: 'right' };
        summary.getCell(row, 4).value = `${pct}%`;
        summary.getCell(row, 4).alignment = { horizontal: 'center' };
        if (i % 2 === 1) {
            [2, 3, 4].forEach(c => {
                summary.getCell(row, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW } };
            });
        }
    });

    // ═══════════════════════════════
    // HOJA 2: DETALLE
    // ═══════════════════════════════
    const detail = workbook.addWorksheet(sheetName);
    detail.columns = [
        { header: 'Fecha', key: 'fecha', width: 16 },
        { header: 'Tipo', key: 'tipo', width: 10 },
        { header: 'Categoría', key: 'categoria', width: 20 },
        { header: 'Monto (RD$)', key: 'monto', width: 15 },
        { header: 'Nota', key: 'nota', width: 30 },
        { header: 'Comercio', key: 'comercio', width: 20 },
    ];

    // Style header row
    detail.getRow(1).eachCell(cell => {
        cell.font = headerFont;
        cell.fill = headerFill;
        cell.alignment = headerAlignment;
        cell.border = { bottom: { style: 'medium', color: { argb: PRIMARY } } };
    });

    // Add data rows
    transactions.forEach((tx, i) => {
        const rawDate = tx.timestamp?.toDate ? tx.timestamp.toDate() : tx.date ? new Date(tx.date + 'T12:00:00') : null;
        const row = detail.addRow({
            fecha: rawDate ? rawDate.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin fecha',
            tipo: tx.type === 'expense' ? 'Gasto' : 'Ingreso',
            categoria: tx.category || 'Sin categoría',
            monto: tx.amount || 0,
            nota: tx.note || '',
            comercio: tx.merchant || '',
        });

        // Format amount as number
        row.getCell('monto').numFmt = currencyFormat;
        row.getCell('monto').alignment = { horizontal: 'right' };

        // Conditional row coloring
        const bgColor = tx.type === 'income' ? INCOME_BG : (i % 2 === 1 ? ALT_ROW : 'FFFFFF');
        row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
            if (tx.type === 'income') cell.font = { color: { argb: '16A34A' } };
            if (tx.type === 'expense' && cell.col === 4) cell.font = { color: { argb: 'DC2626' }, bold: true };
        });
    });

    // Auto-filter
    detail.autoFilter = { from: 'A1', to: 'F1' };

    // ─── Download ───
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Financiero_${today.toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
};
