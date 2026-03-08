/**
 * Smart Category Icon Resolver
 * Assigns Material Symbols icons automatically based on keyword matching.
 * Used for custom (user-created) categories that don't have a hardcoded icon.
 */

const KEYWORD_ICON_MAP = [
    // Food & Groceries
    { keywords: ['comida', 'alimento', 'restaurante', 'pizza', 'burger', 'sushi', 'taco', 'cena', 'almuerzo', 'desayuno', 'cafe', 'café', 'snack', 'merienda', 'cocina'], icon: 'restaurant', color: 'bg-orange-50 text-orange-500' },
    { keywords: ['super', 'mercado', 'despensa', 'grocery', 'tienda', 'colmado', 'bodega', 'compras'], icon: 'shopping_cart', color: 'bg-amber-50 text-amber-600' },

    // Transport
    { keywords: ['gasolina', 'gas', 'combustible', 'transporte', 'uber', 'taxi', 'bus', 'metro', 'auto', 'carro', 'vehiculo', 'vehículo', 'peaje', 'parqueo', 'estacionamiento'], icon: 'directions_car', color: 'bg-blue-50 text-blue-500' },

    // Housing
    { keywords: ['renta', 'alquiler', 'vivienda', 'hipoteca', 'casa', 'apartamento', 'depto', 'hogar', 'condominio'], icon: 'home', color: 'bg-indigo-50 text-indigo-500' },

    // Bills & Services
    { keywords: ['luz', 'agua', 'electricidad', 'internet', 'telefono', 'teléfono', 'cable', 'servicio', 'factura', 'wifi', 'celular', 'plan'], icon: 'bolt', color: 'bg-yellow-50 text-yellow-600' },

    // Health
    { keywords: ['salud', 'medico', 'médico', 'doctor', 'hospital', 'farmacia', 'medicina', 'dentista', 'lentes', 'optica', 'óptica', 'gym', 'gimnasio', 'seguro medico', 'clinica', 'clínica'], icon: 'health_and_safety', color: 'bg-green-50 text-green-600' },

    // Education
    { keywords: ['educacion', 'educación', 'escuela', 'universidad', 'curso', 'libro', 'clase', 'tutor', 'colegio', 'maestria', 'maestría', 'diplomado', 'capacitacion', 'capacitación', 'estudio'], icon: 'school', color: 'bg-cyan-50 text-cyan-600' },

    // Entertainment
    { keywords: ['ocio', 'entretenimiento', 'cine', 'pelicula', 'película', 'juego', 'gaming', 'netflix', 'spotify', 'streaming', 'concierto', 'fiesta', 'bar', 'disco', 'diversion', 'diversión'], icon: 'sports_esports', color: 'bg-pink-50 text-pink-500' },

    // Savings & Investment
    { keywords: ['ahorro', 'inversión', 'inversion', 'fondo', 'cdp', 'plazo fijo', 'bitcoin', 'crypto', 'acciones', 'bolsa', 'etf', 'retiro'], icon: 'savings', color: 'bg-emerald-50 text-emerald-600' },

    // Shopping & Clothes
    { keywords: ['ropa', 'zapato', 'vestir', 'moda', 'fashion', 'tienda', 'shopping', 'accesorio', 'reloj', 'joyeria', 'joyería'], icon: 'checkroom', color: 'bg-fuchsia-50 text-fuchsia-500' },

    // Travel
    { keywords: ['viaje', 'vuelo', 'avion', 'avión', 'hotel', 'vacacion', 'vacación', 'turismo', 'airbnb', 'pasaporte', 'maleta', 'playa'], icon: 'flight', color: 'bg-sky-50 text-sky-500' },

    // Pets
    { keywords: ['mascota', 'perro', 'gato', 'veterinario', 'pet', 'animal'], icon: 'pets', color: 'bg-amber-50 text-amber-500' },

    // Tech & Electronics
    { keywords: ['tech', 'tecnologia', 'tecnología', 'computadora', 'laptop', 'celular', 'gadget', 'electronica', 'electrónica', 'software', 'app'], icon: 'devices', color: 'bg-slate-50 text-slate-600' },

    // Kids & Family
    { keywords: ['hijo', 'hija', 'bebe', 'bebé', 'niño', 'niña', 'familia', 'escolar', 'guarderia', 'guardería', 'pañal'], icon: 'child_care', color: 'bg-rose-50 text-rose-500' },

    // Beauty & Personal Care
    { keywords: ['belleza', 'salon', 'salón', 'peluqueria', 'peluquería', 'barberia', 'barbería', 'uñas', 'spa', 'cuidado personal', 'maquillaje', 'cosmetico', 'cosmético'], icon: 'spa', color: 'bg-purple-50 text-purple-500' },

    // Subscriptions
    { keywords: ['suscripcion', 'suscripción', 'membresia', 'membresía', 'mensualidad', 'cuota'], icon: 'loyalty', color: 'bg-violet-50 text-violet-500' },

    // Work & Income
    { keywords: ['salario', 'sueldo', 'pago', 'nomina', 'nómina', 'quincena', 'ingreso'], icon: 'payments', color: 'bg-emerald-50 text-emerald-600' },
    { keywords: ['freelance', 'proyecto', 'cliente', 'extra', 'comision', 'comisión', 'propina', 'bonus', 'bono'], icon: 'work', color: 'bg-teal-50 text-teal-600' },
    { keywords: ['rendimiento', 'dividendo', 'interes', 'interés', 'ganancia', 'renta pasiva', 'royalty'], icon: 'trending_up', color: 'bg-lime-50 text-lime-600' },

    // Donations & Gifts
    { keywords: ['regalo', 'donacion', 'donación', 'caridad', 'iglesia', 'diezmo', 'ofrenda', 'limosna'], icon: 'redeem', color: 'bg-red-50 text-red-500' },

    // Insurance
    { keywords: ['seguro', 'poliza', 'póliza', 'cobertura', 'aseguradora'], icon: 'shield', color: 'bg-blue-50 text-blue-600' },

    // Debt & Loans
    { keywords: ['deuda', 'prestamo', 'préstamo', 'credito', 'crédito', 'tarjeta', 'financiamiento'], icon: 'account_balance', color: 'bg-red-50 text-red-600' },
];

const DEFAULT_ICON = 'label';
const DEFAULT_COLOR = 'bg-gray-50 text-gray-500';

/**
 * Resolves a Material Symbols icon name for a given category string using keyword matching.
 * @param {string} categoryName - The category name to match
 * @returns {string} Material Symbols icon name
 */
export function getSmartCategoryIcon(categoryName) {
    if (!categoryName) return DEFAULT_ICON;
    const lower = categoryName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    for (const entry of KEYWORD_ICON_MAP) {
        for (const keyword of entry.keywords) {
            const normalizedKeyword = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (lower.includes(normalizedKeyword)) {
                return entry.icon;
            }
        }
    }
    return DEFAULT_ICON;
}

/**
 * Resolves a Tailwind color class for a given category string using keyword matching.
 * @param {string} categoryName - The category name to match
 * @returns {string} Tailwind CSS class string (bg + text)
 */
export function getSmartCategoryColor(categoryName) {
    if (!categoryName) return DEFAULT_COLOR;
    const lower = categoryName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    for (const entry of KEYWORD_ICON_MAP) {
        for (const keyword of entry.keywords) {
            const normalizedKeyword = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (lower.includes(normalizedKeyword)) {
                return entry.color;
            }
        }
    }
    return DEFAULT_COLOR;
}
