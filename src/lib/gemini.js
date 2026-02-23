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
