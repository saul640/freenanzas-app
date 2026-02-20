const numberFormatter = new Intl.NumberFormat('es-DO')

export const formatNumber = (value) => numberFormatter.format(value ?? 0)

export const formatCurrency = (value, { withDecimals = false } = {}) => {
  const formatter = new Intl.NumberFormat('es-DO', {
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  })

  return `RD$ ${formatter.format(value ?? 0)}`
}

export const formatSignedCurrency = (value, { isNegative } = {}) => {
  const prefix = isNegative ? '-' : '+'
  return `${prefix} ${formatCurrency(Math.abs(value ?? 0))}`
}
