export const formatMoney = (amount) => {
  if (amount == null || isNaN(amount)) return '0';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
};

export const formatDate = (timestamp) => {
  if (!timestamp) return 'Reciente';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return `Hoy, ${date.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return `Ayer, ${date.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
  }
  return date.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
};

export const getCategoryIcon = (category) => {
  const map = {
    'Comida': 'shopping_cart',
    'Supermercado y Despensa': 'shopping_cart',
    'Transporte': 'directions_car',
    'Renta': 'home',
    'Vivienda/Alquiler': 'home',
    'Servicios': 'bolt',
    'Servicios Básicos': 'bolt',
    'Ocio': 'sports_esports',
    'Ocio y Entretenimiento': 'sports_esports',
    'Salud': 'health_and_safety',
    'Educación': 'school',
    'Ahorro e Inversión': 'savings',
    'Salario Quincenal': 'payments',
    'Freelance': 'work',
    'Rendimientos': 'trending_up',
  };
  return map[category] || 'receipt_long';
};

export const getCategoryColor = (category) => {
  const map = {
    'Comida': 'bg-orange-50 text-orange-500',
    'Supermercado y Despensa': 'bg-orange-50 text-orange-500',
    'Transporte': 'bg-blue-50 text-blue-500',
    'Renta': 'bg-purple-50 text-purple-500',
    'Vivienda/Alquiler': 'bg-purple-50 text-purple-500',
    'Servicios': 'bg-yellow-50 text-yellow-600',
    'Servicios Básicos': 'bg-yellow-50 text-yellow-600',
    'Ocio': 'bg-pink-50 text-pink-500',
    'Ocio y Entretenimiento': 'bg-red-50 text-red-500',
    'Salud': 'bg-green-50 text-green-600',
    'Ahorro e Inversión': 'bg-emerald-50 text-emerald-600',
  };
  return map[category] || 'bg-gray-50 text-gray-500';
};
