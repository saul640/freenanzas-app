import { notifyAdminError } from '../utils/errorReporting';

const apiKey = "";

async function fetchWithRetry(contents, retries = 5) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    let delay = 1000;

    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents })
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Gemini API Error (${res.status}): ${errText}`);
            }

            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error("Empty response from Gemini");

            return text;
        } catch (error) {
            if (i === retries - 1) {
                await notifyAdminError({
                    errorType: 'AI_Gemini_Failure',
                    message: error.message,
                    context: 'gemini.js fetchWithRetry'
                });
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
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

    const contents = [{ parts: [{ text: prompt }, imagePart] }];
    const responseText = await fetchWithRetry(contents);

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

    const contents = [{ parts: [{ text: prompt }] }];
    let text = (await fetchWithRetry(contents)).trim();
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

    const contents = [{ parts: [{ text: prompt }] }];
    let text = (await fetchWithRetry(contents)).trim();
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

/**
 * Calculate recommended savings based on adaptive 50/30/20 rule.
 * If debt is high, minimum 5% savings. Otherwise target 20%.
 */
export function calcAhorroRecomendado(income, totalDeuda) {
    if (!income || income <= 0) return 0;
    const ratioDeuda = totalDeuda / income;
    if (ratioDeuda > 0.6) return Math.round(income * 0.05);
    if (ratioDeuda > 0.4) return Math.round(income * 0.10);
    if (ratioDeuda > 0.2) return Math.round(income * 0.15);
    return Math.round(income * 0.20);
}

/**
 * Fallback static insights in case Gemini API fails
 */
const FALLBACK_INSIGHTS = [
    "Un presupuesto es decir a tu dinero a dónde ir en lugar de preguntarte a dónde fue.",
    "El 1% administra su dinero en frío, antes de gastarlo.",
    "No ahorres lo que te queda después de gastar; gasta lo que te queda después de ahorrar.",
    "La riqueza no es cuánto dinero ganas, sino cuánto conservas y haces crecer.",
    "Págate a ti mismo primero. Es la regla número uno de las finanzas personales.",
    "El interés compuesto es la octava maravilla del mundo. Quien lo entiende, lo gana; quien no, lo paga.",
    "Evita las deudas de consumo, son el mayor obstáculo para tu libertad financiera.",
    "Tu mayor activo es tu capacidad de generar ingresos.",
    "Comprar cosas que no necesitas para impresionar a gente que no te importa es un mal negocio.",
    "Planifica para el futuro, porque es donde vas a pasar el resto de tu vida."
];

/**
 * Generate a daily financial insight using Gemini AI, avoiding repeated topics
 * @param {Array<string>} history - Array of previously generated insights/topics to avoid
 * @returns {Promise<string>} - The generated insight
 */
export async function generateDailyInsight(history = []) {
    try {


        const historyText = history.length > 0
            ? `Para evitar repetir temas, NO hables de nada relacionado con estos temas pasados:\n${history.map(h => `- ${h}`).join('\n')}`
            : '';

        const prompt = `Eres un asesor financiero experto. Dame un consejo de finanzas personales corto, inspirador y muy práctico (máximo 3 líneas).
${historyText}

Responde ÚNICAMENTE con el texto del consejo, sin comillas, sin formato markdown y directo al grano.`;

        const contents = [{ parts: [{ text: prompt }] }];
        let text = (await fetchWithRetry(contents)).trim();

        // Remove markdown or quotes if Gemini adds them anyway
        text = text.replace(/^["']|["']$/g, '').replace(/^```[\s\S]*?```$/m, '').trim();

        if (!text) throw new Error('Empty response from Gemini');
        return text;
    } catch (error) {
        console.warn('Error generating daily insight from Gemini, using fallback:', error.message);
        // Fallback to a random static insight
        const randomIndex = Math.floor(Math.random() * FALLBACK_INSIGHTS.length);
        return FALLBACK_INSIGHTS[randomIndex];
    }
}

/**
 * Preventive AI: Should the user buy this item?
 * Enhanced with Real Liquidity, cash flow context, and traffic light risk.
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function consultPreventiveAI(data) {


    const presupuestoRestante = Math.max((data.budgetLimit || 0) - (data.budgetSpent || 0), 0);
    const cuotasVencidas = data.cuotasVencidas || 0;
    const cuotasProximas = data.cuotasProximasAVencer || 0;
    const ahorro = data.ahorroRecomendado || 0;
    const liquidezReal = Math.max(presupuestoRestante - cuotasVencidas - cuotasProximas - ahorro, 0);

    const categoryText = data.categorySpending?.slice(0, 6).map(c =>
        `${c.name}: $${c.amount}`
    ).join(' | ') || 'N/A';

    const prompt = `Asesor financiero dominicano. Protege al usuario de compras impulsivas. Fomenta ser "Totalero".

REGLAS:
1. Pagar Balance al Corte al 100%, NUNCA solo el mínimo.
2. Alertar "Tarjetazos" (compras impulsivas que exceden presupuesto).
3. Cruzar precio vs LIQUIDEZ REAL (no presupuesto bruto).
4. Credimás solo para emergencias reales, nunca consumo corriente.
5. PRIORIZAR protección del flujo de caja y meta de ahorro.
6. Si la compra interfiere con cuota próxima a vencer o meta de ahorro, DENEGAR o POSPONER.

CONCEPTO CLAVE — LIQUIDEZ REAL:
Liquidez Real = Presupuesto Restante − Cuotas Vencidas − Cuotas Próximas (10-15 días) − Ahorro Recomendado
Liquidez Real = $${presupuestoRestante} − $${cuotasVencidas} − $${cuotasProximas} − $${ahorro} = RD$ ${liquidezReal}

RESUMEN FINANCIERO:
Ingreso: $${data.monthlyIncome || 0} | Presupuesto: $${data.budgetLimit || 0} | Gastado: $${data.budgetSpent || 0} | Restante bruto: $${presupuestoRestante}
Cuotas vencidas: $${cuotasVencidas} | Cuotas próx. 10-15d: $${cuotasProximas} | Ahorro meta: $${ahorro}
TC deuda: $${data.totalCardDebt || 0} | Balance corte: $${data.cardBalanceAlCorte || 0} | Credimás: $${data.credimasTotalAdeudado || 0} | Préstamos: $${data.totalLoanDebt || 0}
Categorías: ${categoryText}

COMPRA: ${data.itemName} por RD$ ${data.itemPrice}

Responde JSON (sin markdown):
{"recomendacion":"comprar|posponer|evitar","emoji":"✅|⏳|🚫","nivelRiesgo":"verde|amarillo|rojo","razon":"<2-3 oraciones>","detalleFinanciero":"<1 oración con cifras y concepto de liquidez real>","alternativa":"<sugerencia o null>","impactoDeuda":"<impacto en flujo de caja o null>"}`;

    const contents = [{ parts: [{ text: prompt }] }];
    let text = (await fetchWithRetry(contents)).trim();
    if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('No se pudo interpretar la respuesta de la IA');
    }
}

/**
 * Local fallback with Real Liquidity logic
 */
export function consultPreventiveAILocal(data) {
    const presupuestoRestante = Math.max((data.budgetLimit || 0) - (data.budgetSpent || 0), 0);
    const cuotasVencidas = data.cuotasVencidas || 0;
    const cuotasProximas = data.cuotasProximasAVencer || 0;
    const ahorro = data.ahorroRecomendado || 0;
    const liquidezReal = Math.max(presupuestoRestante - cuotasVencidas - cuotasProximas - ahorro, 0);
    const price = data.itemPrice || 0;
    const totalDeuda = (data.totalCardDebt || 0) + (data.totalLoanDebt || 0) + (data.credimasTotalAdeudado || 0);
    const fmt = n => `RD$ ${n.toLocaleString()}`;

    // Price exceeds real liquidity
    if (price > liquidezReal) {
        const hasUpcoming = cuotasProximas > 0;
        const hasOverdue = cuotasVencidas > 0;
        return {
            recomendacion: 'evitar',
            emoji: '🚫',
            nivelRiesgo: 'rojo',
            razon: `Tu liquidez real es solo ${fmt(liquidezReal)} (presupuesto ${fmt(presupuestoRestante)} menos ${hasOverdue ? `cuotas vencidas ${fmt(cuotasVencidas)}, ` : ''}${hasUpcoming ? `compromisos próximos ${fmt(cuotasProximas)}, ` : ''}ahorro ${fmt(ahorro)}). Esta compra de ${fmt(price)} supera tu capacidad real.`,
            detalleFinanciero: `Liquidez Real: ${fmt(liquidezReal)} = ${fmt(presupuestoRestante)} - ${fmt(cuotasVencidas + cuotasProximas)} compromisos - ${fmt(ahorro)} ahorro.`,
            alternativa: hasOverdue ? 'Primero salda tus cuotas vencidas, luego reconsidera.' : 'Espera al próximo mes cuando tengas presupuesto fresco.',
            impactoDeuda: totalDeuda > 0 ? `Deuda total: ${fmt(totalDeuda)}. No es momento para gastar de más.` : null,
        };
    }

    // Price > 50% of real liquidity with upcoming payments
    if (cuotasProximas > 0 && price > liquidezReal * 0.5) {
        return {
            recomendacion: 'posponer',
            emoji: '⏳',
            nivelRiesgo: 'amarillo',
            razon: `Tienes ${fmt(cuotasProximas)} en compromisos que vencen en los próximos días. Aunque técnicamente puedes cubrir esta compra, reduce tu margen de seguridad para esos pagos y tu meta de ahorro de ${fmt(ahorro)}.`,
            detalleFinanciero: `Liquidez Real: ${fmt(liquidezReal)}. Después de la compra: ${fmt(liquidezReal - price)}.`,
            alternativa: 'Espera a que pasen los vencimientos próximos, luego evalúa si aún es prudente.',
            impactoDeuda: null,
        };
    }

    // Balance al corte pending
    if ((data.cardBalanceAlCorte || 0) > 0 && price > liquidezReal * 0.4) {
        return {
            recomendacion: 'posponer',
            emoji: '⏳',
            nivelRiesgo: 'amarillo',
            razon: `Tienes ${fmt(data.cardBalanceAlCorte)} de balance al corte pendiente. Pagar eso primero (sé Totalero) te evita intereses.`,
            detalleFinanciero: `Balance al corte: ${fmt(data.cardBalanceAlCorte)}. Liquidez Real: ${fmt(liquidezReal)}.`,
            alternativa: 'Paga el balance al corte primero, luego considera esta compra.',
            impactoDeuda: null,
        };
    }

    // OK to buy
    return {
        recomendacion: 'comprar',
        emoji: '✅',
        nivelRiesgo: 'verde',
        razon: `Tu liquidez real es ${fmt(liquidezReal)} y esta compra de ${fmt(price)} es manejable. Tus compromisos y meta de ahorro están cubiertos.`,
        detalleFinanciero: `Después de la compra te quedarán ${fmt(liquidezReal - price)} de liquidez real.`,
        alternativa: null,
        impactoDeuda: null,
    };
}
