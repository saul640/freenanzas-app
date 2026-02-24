import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize direct Gemini API client
let genAI = null;
let aiModel = null;

function getModel() {
    if (aiModel) return aiModel;

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Falta VITE_GEMINI_API_KEY. Ve a Google AI Studio, genera una API Key con tus créditos y agrégala a tu archivo .env.local');
    }

    genAI = new GoogleGenerativeAI(apiKey);
    aiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    return aiModel;
}

/**
 * Convert a File object to a Gemini-compatible inline data part
 */
async function fileToGenerativePart(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1];
            resolve({
                inlineData: {
                    data: base64Data,
                    mimeType: file.type || 'image/jpeg',
                },
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Scan a receipt/invoice image using Gemini AI and extract structured data
 * @param {File} file - The image file to scan
 * @returns {Promise<Object>} - Extracted receipt data
 */
export async function scanReceiptWithAI(file) {
    const model = getModel();
    const imagePart = await fileToGenerativePart(file);

    const prompt = `Analiza esta imagen de factura, recibo o ticket y extrae TODOS los datos visibles.

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin backticks, sin texto adicional) con esta estructura exacta:

{
  "monto": <número decimal del monto total/importe a pagar, e.g. 100.00>,
  "moneda": "<código de moneda detectado, e.g. DOP, USD, RD$>",
  "comercio": "<nombre del comercio, empresa o establecimiento>",
  "rnc": "<número RNC o identificación fiscal si aparece, o null>",
  "operador": "<nombre del operador/cajero si aparece, o null>",
  "ubicacion": "<ubicación, estación, dirección o sucursal si aparece, o null>",
  "numeroTicket": "<número de ticket, factura o comprobante si aparece, o null>",
  "fecha": "<fecha en formato YYYY-MM-DD si aparece, o null>",
  "hora": "<hora en formato HH:MM:SS si aparece, o null>",
  "detalles": "<cualquier otro detalle relevante como tipo de vehículo, sentido, items comprados, etc., o null>",
  "categoriasSugeridas": ["<sugerencia1>", "<sugerencia2>"],
  "confianza": <número de 0 a 1 indicando qué tan seguro estás de la lectura>
}

Reglas:
- El monto DEBE ser un número, no un string. Si hay múltiples montos, usa el TOTAL o IMPORTE.
- Si no puedes leer un campo, usa null.
- Para categoriasSugeridas, sugiere entre estas opciones: Comida, Transporte, Renta, Servicios, Ocio, Salud, Educación, Ahorro, Otros.
- La fecha debe estar en formato YYYY-MM-DD (convierte cualquier formato encontrado).
- Responde SOLO con el JSON, nada más.`;

    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text();

    // Parse the JSON response — handle possible markdown wrapping
    let cleanedText = responseText.trim();
    // Remove markdown code block if present
    if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    let parsed;
    try {
        parsed = JSON.parse(cleanedText);
    } catch {
        console.error('Gemini response was not valid JSON:', responseText);
        // Try to extract JSON from the response
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
        } else {
            throw new Error('No se pudo interpretar la respuesta de la IA');
        }
    }

    // Normalize and validate the parsed data
    return {
        amount: typeof parsed.monto === 'number' && parsed.monto > 0 ? parsed.monto : null,
        currency: parsed.moneda || 'DOP',
        merchant: parsed.comercio || null,
        rnc: parsed.rnc || null,
        operator: parsed.operador || null,
        location: parsed.ubicacion || null,
        ticketNumber: parsed.numeroTicket || null,
        date: parsed.fecha || null,
        time: parsed.hora || null,
        details: parsed.detalles || null,
        suggestedCategories: Array.isArray(parsed.categoriasSugeridas) ? parsed.categoriasSugeridas : [],
        confidence: typeof parsed.confianza === 'number' ? parsed.confianza : 0,
        rawResponse: parsed,
    };
}

/**
 * Map AI-suggested categories to app categories
 */
const CATEGORY_MAP = {
    comida: 'Comida',
    alimentacion: 'Comida',
    restaurante: 'Comida',
    transporte: 'Transporte',
    peaje: 'Transporte',
    gasolina: 'Transporte',
    combustible: 'Transporte',
    taxi: 'Transporte',
    uber: 'Transporte',
    renta: 'Renta',
    alquiler: 'Renta',
    vivienda: 'Renta',
    servicios: 'Servicios',
    luz: 'Servicios',
    agua: 'Servicios',
    internet: 'Servicios',
    ocio: 'Ocio',
    entretenimiento: 'Ocio',
    salud: 'Salud',
    farmacia: 'Salud',
    medico: 'Salud',
    educacion: 'Educación',
    educación: 'Educación',
    ahorro: 'Ahorro',
    otros: 'Otros',
};

/**
 * Get the best matching app category from AI suggestions
 */
export function getBestCategory(suggestedCategories) {
    if (!Array.isArray(suggestedCategories) || suggestedCategories.length === 0) {
        return null;
    }

    for (const suggestion of suggestedCategories) {
        const key = suggestion.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (CATEGORY_MAP[key]) {
            return CATEGORY_MAP[key];
        }
        // Try partial match
        for (const [mapKey, mapValue] of Object.entries(CATEGORY_MAP)) {
            if (key.includes(mapKey) || mapKey.includes(key)) {
                return mapValue;
            }
        }
    }

    return suggestedCategories[0] || null;
}

/**
 * Analyze user spending with Gemini AI for financial advice
 * @param {Object} data - { totalIncome, totalExpense, categories: [{ name, amount, count }], monthName }
 * @returns {Promise<Object>} - Insights with tips, ant expenses, savings potential
 */
export async function analyzeSpending(data) {
    const model = getModel();
    const prompt = `Eres un asesor financiero personal dominicano. Analiza estos gastos del mes de ${data.monthName}:

Ingresos: RD$ ${data.totalIncome}
Gastos totales: RD$ ${data.totalExpense}
Balance: RD$ ${data.totalIncome - data.totalExpense}

Desglose por categoría:
${data.categories.map(c => `- ${c.name}: RD$ ${c.amount} (${c.count} transacciones)`).join('\n')}

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin backticks):
{
  "resumen": "<2 oraciones sobre la salud financiera del usuario>",
  "regla503020": {
    "necesidades": <% ideal en necesidades>,
    "deseos": <% ideal en deseos>,
    "ahorro": <% ideal en ahorro>,
    "necesidadesReal": <% real gastado en necesidades>,
    "deseosReal": <% real gastado en deseos>,
    "ahorroReal": <% real ahorrado>,
    "veredicto": "<1 oración sobre el cumplimiento de la regla>"
  },
  "gastosHormiga": [
    { "categoria": "<nombre>", "monto": <número>, "frecuencia": <count>, "consejo": "<1 oración>" }
  ],
  "potencialAhorro": <número estimado que podría ahorrar>,
  "tips": [
    "<tip personalizado 1>",
    "<tip personalizado 2>",
    "<tip personalizado 3>"
  ],
  "alerta": "<alerta principal si hay algo crítico, o null>"
}`;

    const result = await model.generateContent([prompt]);
    let text = result.response.text().trim();
    if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('No se pudo interpretar el análisis de la IA');
    }
}

/**
 * Local fallback: find "ant" expenses without needing an API key
 * @param {Array} categories - [{ name, amount, count }]
 * @param {number} totalExpense
 * @returns {Object}
 */
export function analyzeSpendingLocal(categories, totalExpense) {
    const antExpenses = categories
        .filter(c => c.count >= 3 && c.amount < 500)
        .map(c => ({
            categoria: c.name,
            monto: c.amount,
            frecuencia: c.count,
            consejo: `Tienes ${c.count} gastos en ${c.name}. Intenta reducirlos o consolidarlos.`,
        }));

    const potentialSaving = antExpenses.reduce((s, e) => s + e.monto * 0.5, 0);

    return {
        resumen: totalExpense > 0 ? 'Análisis local de tus gastos (sin IA). Conecta tu API key de Gemini para obtener análisis personalizado.' : 'No hay gastos registrados aún.',
        gastosHormiga: antExpenses,
        potencialAhorro: Math.round(potentialSaving),
        tips: [
            'Intenta aplicar la regla 50-30-20: 50% necesidades, 30% deseos, 20% ahorro.',
            'Revisa suscripciones mensuales que no uses.',
            'Establece un presupuesto semanal para compras impulsivas.',
        ],
        alerta: null,
    };
}

/**
 * Analyze loan payoff strategy using Gemini AI
 * @param {Object} data - { loans, totalIncome, totalExpense, categories, monthName, budgetLimit }
 * @returns {Promise<Object>} - Debt strategy with steps, savings, and recommendations
 */
export async function analyzeLoanStrategy(data) {
    const model = getModel();

    const loansText = data.loans.map(l =>
        `- ${l.nombrePrestamo}: Balance RD$ ${l.balancePendiente}, Cuota RD$ ${l.cuotaMensual}, Tasa ${l.tasaInteres}% anual, Día de pago: ${l.diaDePago}`
    ).join('\n');

    const categoriasText = data.categories.map(c =>
        `- ${c.name}: RD$ ${c.amount} (${c.count} transacciones)`
    ).join('\n');

    const prompt = `Eres un asesor financiero dominicano experto en salida de deudas. Analiza la situación financiera y genera un plan para saldar los préstamos.

DATOS DEL MES DE ${data.monthName}:
Ingresos: RD$ ${data.totalIncome}
Gastos totales: RD$ ${data.totalExpense}
Presupuesto mensual: RD$ ${data.budgetLimit || 0}
Balance disponible después de gastos: RD$ ${data.totalIncome - data.totalExpense}

PRÉSTAMOS ACTIVOS:
${loansText}

DESGLOSE DE GASTOS POR CATEGORÍA:
${categoriasText}

INSTRUCCIONES:
1. Identifica categorías donde el usuario gasta de más y podría recortar.
2. Calcula cuánto dinero extra podría destinar a pagar deudas si reduce gastos no esenciales.
3. Recomienda el Método Avalancha (mayor tasa primero) o Bola de Nieve (menor balance primero) según su situación.
4. Genera un plan paso a paso con montos específicos.

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin backticks):
{
  "estrategiaRecomendada": "avalancha" | "bola_de_nieve",
  "razonEstrategia": "<1-2 oraciones explicando por qué esa estrategia>",
  "ordenPago": [
    { "nombre": "<nombre préstamo>", "balance": <número>, "tasa": <número>, "prioridad": <1,2,3...> }
  ],
  "gastosRecortables": [
    { "categoria": "<nombre>", "gastoActual": <número>, "gastoSugerido": <número>, "ahorroPotencial": <número>, "consejo": "<1 oración>" }
  ],
  "dineroExtraDisponible": <número estimado que podría redirigir a deudas>,
  "planAccion": [
    "<paso 1 específico con montos>",
    "<paso 2 específico con montos>",
    "<paso 3 específico con montos>"
  ],
  "ahorroIntereses": <número estimado de ahorro en intereses a largo plazo>,
  "mesesAcelerados": <número de meses que adelantaría el pago>,
  "resumen": "<2-3 oraciones motivacionales con el plan resumido>"
}`;

    const result = await model.generateContent([prompt]);
    let text = result.response.text().trim();
    if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('No se pudo interpretar el plan de deudas de la IA');
    }
}

/**
 * Local fallback for loan strategy without AI
 * @param {Array} loans - [{ nombrePrestamo, balancePendiente, tasaInteres, cuotaMensual }]
 * @param {Array} categories - [{ name, amount, count }]
 * @param {number} totalIncome
 * @param {number} totalExpense
 * @returns {Object}
 */
export function analyzeLoanStrategyLocal(loans, categories, totalIncome, totalExpense) {
    if (!loans || loans.length === 0) return null;

    // Avalanche: sort by highest interest rate
    const avalanche = [...loans].sort((a, b) => (b.tasaInteres || 0) - (a.tasaInteres || 0));
    // Snowball: sort by lowest balance
    const snowball = [...loans].sort((a, b) => (a.balancePendiente || 0) - (b.balancePendiente || 0));

    // Recommend avalanche if there's a significant interest rate spread
    const maxRate = Math.max(...loans.map(l => l.tasaInteres || 0));
    const minRate = Math.min(...loans.map(l => l.tasaInteres || 0));
    const useAvalanche = (maxRate - minRate) > 3;

    const chosen = useAvalanche ? avalanche : snowball;
    const estrategia = useAvalanche ? 'avalancha' : 'bola_de_nieve';

    // Find recortable expenses (non-essential categories with high spending)
    const nonEssential = ['Ocio', 'Ocio y Entretenimiento', 'Otros'];
    const recortables = categories
        .filter(c => nonEssential.some(ne => c.name.includes(ne)) || c.count >= 5)
        .map(c => ({
            categoria: c.name,
            gastoActual: c.amount,
            gastoSugerido: Math.round(c.amount * 0.5),
            ahorroPotencial: Math.round(c.amount * 0.5),
            consejo: `Reduce ${c.name} a la mitad para liberar fondos.`,
        }));

    const dineroExtra = recortables.reduce((s, r) => s + r.ahorroPotencial, 0);

    return {
        estrategiaRecomendada: estrategia,
        razonEstrategia: useAvalanche
            ? 'Tienes préstamos con tasas de interés muy diferentes. Pagar primero el de mayor tasa te ahorra más dinero.'
            : 'Tus tasas son similares. Pagar primero el de menor balance te dará victorias rápidas para mantenerte motivado.',
        ordenPago: chosen.map((l, i) => ({
            nombre: l.nombrePrestamo,
            balance: l.balancePendiente,
            tasa: l.tasaInteres,
            prioridad: i + 1,
        })),
        gastosRecortables: recortables,
        dineroExtraDisponible: dineroExtra,
        planAccion: [
            `Paga el mínimo en todos los préstamos excepto "${chosen[0]?.nombrePrestamo}".`,
            `Destina los RD$ ${dineroExtra.toLocaleString()} extra al préstamo prioritario.`,
            `Una vez liquidado, redirige todo ese pago al siguiente en la lista.`,
        ],
        ahorroIntereses: Math.round(dineroExtra * 3),
        mesesAcelerados: dineroExtra > 0 ? Math.max(1, Math.round(chosen[0]?.balancePendiente / (chosen[0]?.cuotaMensual + dineroExtra) * -1 + chosen[0]?.balancePendiente / chosen[0]?.cuotaMensual)) : 0,
        resumen: `Usando el método ${estrategia === 'avalancha' ? 'Avalancha' : 'Bola de Nieve'}, enfócate en pagar "${chosen[0]?.nombrePrestamo}" primero. Recortando gastos no esenciales puedes liberar RD$ ${dineroExtra.toLocaleString()} extra cada mes.`,
    };
}

