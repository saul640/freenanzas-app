export const getMonthKey = (date = new Date()) => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${month}`
}

export const formatTransactionDate = (date) => {
  if (!date) return ''
  const now = new Date()
  const isSameDay = date.toDateString() === now.toDateString()
  const time = date.toLocaleTimeString('es-DO', {
    hour: 'numeric',
    minute: '2-digit',
  })

  if (isSameDay) {
    return `Hoy, ${time}`
  }

  const day = date.toLocaleDateString('es-DO', {
    day: 'numeric',
    month: 'short',
  })

  return `${day}, ${time}`
}

export const getTransactionCalendarParts = (transaction) => {
  if (typeof transaction?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) {
    const [year, month, day] = transaction.date.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return { year, month: month - 1 };
    }
  }
  const value = transaction?.timestamp?.toDate?.() || transaction?.createdAt?.toDate?.() || transaction?.timestamp || transaction?.createdAt;
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? { year: date.getFullYear(), month: date.getMonth() } : null;
};
