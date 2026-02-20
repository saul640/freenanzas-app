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
