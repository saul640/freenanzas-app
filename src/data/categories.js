export const TRANSACTION_CATEGORIES = [
  {
    id: 'comida',
    label: 'Comida',
    icon: 'shopping_cart',
    iconClass: 'bg-orange-100 text-orange-600',
  },
  {
    id: 'transporte',
    label: 'Transporte',
    icon: 'directions_bus',
    iconClass: 'bg-slate-100 text-slate-600',
  },
  {
    id: 'vivienda',
    label: 'Vivienda',
    icon: 'home',
    iconClass: 'bg-emerald-100 text-emerald-600',
  },
  {
    id: 'salud',
    label: 'Salud',
    icon: 'medical_services',
    iconClass: 'bg-rose-100 text-rose-600',
  },
  {
    id: 'ocio',
    label: 'Ocio',
    icon: 'sports_esports',
    iconClass: 'bg-indigo-100 text-indigo-600',
  },
  {
    id: 'ahorro',
    label: 'Ahorro',
    icon: 'savings',
    iconClass: 'bg-primary/10 text-primary',
  },
]

export const DEFAULT_BUDGETS = [
  { categoryId: 'comida', limit: 15000 },
  { categoryId: 'transporte', limit: 8000 },
  { categoryId: 'vivienda', limit: 12000 },
  { categoryId: 'salud', limit: 5000 },
  { categoryId: 'ocio', limit: 5000 },
]

export const getCategoryById = (categoryId) =>
  TRANSACTION_CATEGORIES.find((category) => category.id === categoryId)

export const isSavingsCategory = (categoryId) => categoryId === 'ahorro'
