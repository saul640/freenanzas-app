import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import Tesseract from 'tesseract.js';

const expenseCategories = [
    { name: 'Comida', icon: 'shopping_cart' },
    { name: 'Transporte', icon: 'directions_car' },
    { name: 'Renta', icon: 'home' },
    { name: 'Servicios', icon: 'bolt' },
    { name: 'Ocio', icon: 'sports_esports' },
    { name: 'Salud', icon: 'health_and_safety' },
    { name: 'Educación', icon: 'school' },
    { name: 'Ahorro', icon: 'savings' },
    { name: 'Otros', icon: 'more_horiz' },
];

const incomeCategories = [
    { name: 'Salario', icon: 'payments' },
    { name: 'Freelance', icon: 'work' },
    { name: 'Rendimientos', icon: 'trending_up' },
    { name: 'Otros', icon: 'more_horiz' },
];

const CATEGORY_KEYWORDS = {
    expense: {
        Comida: ['RESTAURANTE', 'PIZZA', 'BURGER', 'CAFETERIA', 'CAFE', 'FOOD', 'COMIDA', 'ALMUERZO', 'CENA', 'BAR', 'TAQUERIA', 'PANADERIA', 'DELIVERY'],
        Transporte: ['UBER', 'TAXI', 'GASOLINA', 'COMBUSTIBLE', 'TRANSPORTE', 'BUS', 'METRO', 'PEAJE', 'PARKING'],
        Renta: ['RENTA', 'ALQUILER', 'ARRENDAMIENTO', 'HIPOTECA'],
        Servicios: ['LUZ', 'AGUA', 'INTERNET', 'TELECOM', 'CABLE', 'TELEFONO', 'SERVICIO', 'ELECTRICIDAD'],
        Ocio: ['CINE', 'NETFLIX', 'SPOTIFY', 'ENTRETENIMIENTO', 'OCIO', 'JUEGO', 'CONCIERTO'],
        Salud: ['FARMACIA', 'CLINICA', 'HOSPITAL', 'MEDICO', 'SALUD', 'LABORATORIO', 'SEGURO'],
        Educación: ['COLEGIO', 'UNIVERSIDAD', 'CURSO', 'LIBRO', 'EDUCACION', 'MATRICULA'],
        Ahorro: ['AHORRO', 'INVERSION', 'FONDO', 'BANCO'],
    },
    income: {
        Salario: ['SALARIO', 'NOMINA', 'PAYROLL'],
        Freelance: ['FREELANCE', 'HONORARIOS', 'SERVICIO PROFESIONAL'],
        Rendimientos: ['INTERESES', 'DIVIDENDO', 'RENDIMIENTO'],
        Otros: ['TRANSFERENCIA', 'PAGO', 'DEPOSITO'],
    },
};

const normalizeCategoryName = (value) => value.trim().toLowerCase();

const parseAmountString = (value) => {
    if (!value) return null;
    const cleaned = value.replace(/[\sRD$DOP$]/gi, '').replace(/[^\d.,]/g, '');
    if (!cleaned) return null;
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    let normalized = cleaned;

    if (lastComma > lastDot) {
        normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma) {
        normalized = cleaned.replace(/,/g, '');
    } else {
        normalized = cleaned.replace(/[.,]/g, '');
    }

    const amount = Number(normalized);
    if (!Number.isFinite(amount)) return null;
    return amount;
};

const extractAmountsFromText = (text) => {
    const matches = text.match(/\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})?/g) || [];
    return matches
        .map(parseAmountString)
        .filter((value) => Number.isFinite(value) && value > 0);
};

const extractAmountFromText = (text) => {
    const lines = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    const keywordLines = ['TOTAL', 'TOTAL A PAGAR', 'IMPORTE', 'MONTO', 'PAGAR', 'TOTAL RD', 'TOTAL RD$', 'TOTAL:'];

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].toUpperCase();
        if (keywordLines.some((keyword) => line.includes(keyword)) && !line.includes('SUBTOTAL')) {
            const sameLine = extractAmountsFromText(lines[index]);
            if (sameLine.length) return Math.max(...sameLine);
            const nextLine = lines[index + 1] ? extractAmountsFromText(lines[index + 1]) : [];
            if (nextLine.length) return Math.max(...nextLine);
        }
    }

    const currencyLines = lines.filter((line) => /(RD\$|DOP|\$)/i.test(line));
    const currencyCandidates = currencyLines.flatMap(extractAmountsFromText);
    if (currencyCandidates.length) return Math.max(...currencyCandidates);

    const allCandidates = lines.flatMap(extractAmountsFromText);
    if (allCandidates.length) return Math.max(...allCandidates);

    return null;
};

const inferCategoryFromText = (text, type) => {
    const keywordsMap = CATEGORY_KEYWORDS[type] || {};
    const upperText = text.toUpperCase();
    let bestCategory = null;
    let bestScore = 0;

    Object.entries(keywordsMap).forEach(([categoryName, keywords]) => {
        const score = keywords.reduce((total, keyword) => (upperText.includes(keyword) ? total + 1 : total), 0);
        if (score > bestScore) {
            bestScore = score;
            bestCategory = categoryName;
        }
    });

    return bestScore > 0 ? bestCategory : null;
};

const extractMerchantName = (text) => {
    const lines = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    for (const line of lines) {
        const upperLine = line.toUpperCase();
        if (upperLine.length < 3) continue;
        if (/\d/.test(upperLine)) continue;
        if (/FACTURA|RNC|TEL|TELEFONO|IVA|NIT|CLIENTE|FECHA|CAJERO|COMPROBANTE|RECIBO/.test(upperLine)) continue;
        return line;
    }

    return '';
};

export default function AddTransaction() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [type, setType] = useState('expense');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('Comida');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showAllCats, setShowAllCats] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState('');
    const [pendingScan, setPendingScan] = useState(null);
    const [customCategories, setCustomCategories] = useState([]);
    const [showCategoryCreator, setShowCategoryCreator] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [creatingCategory, setCreatingCategory] = useState(false);

    const baseCategories = type === 'expense' ? expenseCategories : incomeCategories;
    const normalizedBaseNames = baseCategories.map((cat) => normalizeCategoryName(cat.name));
    const typeCustomCategories = customCategories
        .filter((cat) => cat.type === type)
        .filter((cat) => !normalizedBaseNames.includes(normalizeCategoryName(cat.name)));
    const mergedCategories = [...baseCategories, ...typeCustomCategories];
    const visibleCategories = showAllCats ? mergedCategories : mergedCategories.slice(0, 6);

    const handleCameraCapture = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setScanning(true);
            setScanProgress('Iniciando escáner...');
            setError('');
            setPendingScan(null);

            const result = await Tesseract.recognize(
                file,
                'spa',
                {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            setScanProgress(`Manejador OCR: ${Math.round(m.progress * 100)}%`);
                        }
                    }
                }
            );

            const text = result.data.text;
            console.log("OCR Result:", text);
            setScanProgress('Analizando monto...');
            const upperText = text.toUpperCase();
            const foundAmount = extractAmountFromText(upperText);
            const suggestedCategory = inferCategoryFromText(upperText, type);
            const merchantName = extractMerchantName(text);

            if (foundAmount && foundAmount > 0) {
                setPendingScan({
                    amount: foundAmount,
                    category: suggestedCategory,
                    merchant: merchantName,
                    rawText: text,
                });
            } else {
                setError('No se pudo encontrar un monto claro en la imagen.');
            }
        } catch (err) {
            console.error('OCR Error:', err);
            setError('Error al procesar la imagen con OCR.');
        } finally {
            setScanning(false);
            setScanProgress('');
            e.target.value = '';
        }
    };

    React.useEffect(() => {
        if (!db || !currentUser) return undefined;

        const categoriesRef = collection(db, 'users', currentUser.uid, 'categories');

        const unsubscribe = onSnapshot(
            categoriesRef,
            (snapshot) => {
                const data = snapshot.docs
                    .map((doc) => ({ id: doc.id, ...doc.data() }))
                    .filter((item) => item?.name);
                const sorted = data.sort((a, b) => a.name.localeCompare(b.name));
                setCustomCategories(sorted.map((item) => ({
                    id: item.id,
                    name: item.name,
                    type: item.type || 'expense',
                    icon: item.icon || 'label',
                })));
            },
            (err) => {
                console.error('Error cargando categorias', err);
            }
        );

        return () => unsubscribe();
    }, [currentUser]);

    React.useEffect(() => {
        if (!mergedCategories.length) {
            setCategory('');
            return;
        }
        const categoryExists = mergedCategories.some((cat) => cat.name === category);
        if (!categoryExists) {
            setCategory(mergedCategories[0].name);
        }
    }, [category, mergedCategories]);

    const handleAmountChange = (e) => {
        let val = e.target.value;
        // Only allow digits and one decimal point
        val = val.replace(/[^0-9.]/g, '');
        // Prevent multiple dots
        const parts = val.split('.');
        if (parts.length > 2) {
            val = parts[0] + '.' + parts.slice(1).join('');
        }
        setAmount(val);
        if (pendingScan) setPendingScan(null);
        if (error) setError('');
    };

    const handleCategorySelect = (value) => {
        setCategory(value);
        if (pendingScan) setPendingScan(null);
        if (error) setError('');
    };

    const handleApplyScan = () => {
        if (!pendingScan) return;
        setAmount(pendingScan.amount.toString());
        if (pendingScan.category && mergedCategories.some((cat) => cat.name === pendingScan.category)) {
            setCategory(pendingScan.category);
        }
        if (!note.trim()) {
            setNote(pendingScan.merchant || 'Factura escaneada');
        }
        setPendingScan(null);
    };

    const handleDismissScan = () => {
        setPendingScan(null);
    };

    const handleCreateCategory = async () => {
        const trimmedName = newCategoryName.trim();
        if (!trimmedName) {
            setError('Escribe un nombre de categoria.');
            return;
        }
        if (!currentUser || !db) {
            setError('Inicia sesion para crear categorias.');
            return;
        }

        const exists = mergedCategories.some((cat) => normalizeCategoryName(cat.name) === normalizeCategoryName(trimmedName));
        if (exists) {
            setError('Esa categoria ya existe.');
            return;
        }

        try {
            setCreatingCategory(true);
            setError('');
            await addDoc(collection(db, 'users', currentUser.uid, 'categories'), {
                userId: currentUser.uid,
                name: trimmedName,
                type,
                icon: 'label',
                createdAt: serverTimestamp(),
            });
            setCategory(trimmedName);
            setNewCategoryName('');
            setShowCategoryCreator(false);
        } catch (err) {
            console.error('Error creando categoria', err);
            setError('No pudimos crear la categoria. Intenta de nuevo.');
        } finally {
            setCreatingCategory(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const parsedAmount = parseFloat(amount);
        if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
            setError('Por favor ingresa un monto mayor a 0.');
            return;
        }
        if (pendingScan) {
            setError('Confirma el monto detectado o edita manualmente antes de guardar.');
            return;
        }
        if (!category) {
            setError('Por favor selecciona una categoría.');
            return;
        }

        try {
            setLoading(true);
            setError('');

            if (db && currentUser) {
                await addDoc(collection(db, 'transactions'), {
                    userId: currentUser.uid,
                    type,
                    amount: parsedAmount,
                    category,
                    date,
                    note: note.trim(),
                    timestamp: serverTimestamp()
                });
            }

            navigate('/');
        } catch (err) {
            console.error('Error adding document: ', err);
            setError('Error al guardar la transacción.');
        } finally {
            setLoading(false);
        }
    };

    const isToday = date === new Date().toISOString().split('T')[0];

    return (
        <div className="flex flex-col min-h-screen bg-[#f7f9f8]">
            {/* Header */}
            <header className="px-6 py-4 flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="text-sm text-gray-500 font-medium">Cancelar</button>
                <h1 className="text-lg font-bold">Añadir Transacción</h1>
                <div className="w-16" />
            </header>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
                <div className="flex-1 overflow-y-auto px-6 space-y-6 pb-28">
                    {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm text-center font-medium">{error}</div>}

                    {/* Type Toggle */}
                    <div className="flex p-1 bg-gray-100 rounded-xl">
                        <button
                            type="button"
                            onClick={() => setType('expense')}
                            className={`flex-1 py-2.5 font-semibold rounded-lg transition-all text-sm ${type === 'expense' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}
                        >
                            Gasto
                        </button>
                        <button
                            type="button"
                            onClick={() => setType('income')}
                            className={`flex-1 py-2.5 font-semibold rounded-lg transition-all text-sm ${type === 'income' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}
                        >
                            Ingreso
                        </button>
                    </div>

                    {/* Amount Display */}
                    <div className="text-center py-4 relative">
                        <p className="text-xs text-primary font-semibold tracking-widest uppercase mb-2">Monto</p>

                        <div className="absolute right-0 top-1/2 -translate-y-1/2">
                            <input
                                type="file"
                                accept="image/*"
                                id="cameraInput"
                                className="hidden"
                                onChange={handleCameraCapture}
                                disabled={scanning}
                            />
                            <label
                                htmlFor="cameraInput"
                                className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl border border-gray-100 shadow-sm transition-all cursor-[pointer] ${scanning ? 'bg-primary/10 border-primary/20 pointer-events-none' : 'bg-white hover:bg-gray-50 active:scale-95'}`}
                            >
                                <span className={`material-symbols-rounded ${scanning ? 'animate-pulse text-primary' : 'text-gray-400'}`}>
                                    {scanning ? 'document_scanner' : 'photo_camera'}
                                </span>
                                <span className={`text-[8px] font-bold uppercase tracking-wider mt-1 ${scanning ? 'text-primary' : 'text-gray-400'}`}>
                                    {scanning ? 'OCR' : 'Subir'}
                                </span>
                            </label>
                        </div>

                        <div className="flex flex-col items-center justify-center">
                            <div className="flex items-baseline justify-center">
                                <span className="text-4xl font-bold text-gray-800 mr-1">RD$</span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={amount}
                                    onChange={handleAmountChange}
                                    placeholder="0"
                                    className={`text-5xl font-bold bg-transparent border-none outline-none text-center w-40 p-0 focus:ring-0 placeholder:text-gray-300 ${scanning ? 'animate-pulse text-gray-300' : ''}`}
                                    autoFocus
                                    required
                                />
                            </div>
                            {scanProgress && (
                                <p className="text-xs text-primary font-medium mt-2 animate-pulse bg-primary/10 px-3 py-1 rounded-full">
                                    {scanProgress}
                                </p>
                            )}
                            {pendingScan && (
                                <div className="mt-4 bg-white border border-primary/20 rounded-2xl p-3 text-left shadow-sm">
                                    <p className="text-[10px] uppercase tracking-wider font-semibold text-primary">Datos detectados</p>
                                    <p className="text-sm font-semibold text-gray-800 mt-1">Monto: RD$ {pendingScan.amount.toLocaleString('es-DO')}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Categoria sugerida: {pendingScan.category || 'Sin sugerencia'}
                                    </p>
                                    {pendingScan.merchant ? (
                                        <p className="text-xs text-gray-400 mt-1">Comercio: {pendingScan.merchant}</p>
                                    ) : null}
                                    <div className="flex gap-2 mt-3">
                                        <button
                                            type="button"
                                            onClick={handleApplyScan}
                                            className="flex-1 bg-primary text-black font-semibold text-xs py-2 rounded-xl"
                                        >
                                            Aplicar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleDismissScan}
                                            className="flex-1 bg-gray-100 text-gray-600 font-semibold text-xs py-2 rounded-xl"
                                        >
                                            Editar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Categories Grid */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-semibold text-gray-800">Categoría</h3>
                            <button type="button" onClick={() => setShowAllCats(!showAllCats)} className="text-primary text-sm font-medium">
                                {showAllCats ? 'Ver menos' : 'Ver todas'}
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {visibleCategories.map(cat => (
                                <button
                                    key={cat.name}
                                    type="button"
                                    onClick={() => handleCategorySelect(cat.name)}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${category === cat.name
                                        ? 'border-primary bg-white shadow-sm'
                                        : 'border-transparent bg-white'
                                        }`}
                                >
                                    <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center ${category === cat.name ? 'bg-primary/10' : 'bg-gray-100'
                                        }`}>
                                        <span className={`material-symbols-rounded ${category === cat.name ? 'text-primary' : 'text-gray-500'}`}>{cat.icon}</span>
                                        {category === cat.name && (
                                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                                <span className="material-symbols-rounded text-white text-xs">check</span>
                                            </div>
                                        )}
                                    </div>
                                    <span className={`text-xs font-medium ${category === cat.name ? 'text-gray-800' : 'text-gray-500'}`}>{cat.name}</span>
                                </button>
                            ))}
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setShowCategoryCreator(!showCategoryCreator)}
                                className="text-primary text-sm font-medium"
                            >
                                {showCategoryCreator ? 'Cancelar nueva categoria' : '+ Crear categoria'}
                            </button>
                            {customCategories.length > 0 && (
                                <span className="text-[11px] text-gray-400">Personalizadas: {customCategories.length}</span>
                            )}
                        </div>
                        {showCategoryCreator && (
                            <div className="mt-3 bg-white border border-gray-100 rounded-2xl p-3 flex items-center gap-2">
                                <input
                                    type="text"
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    placeholder="Nombre de categoria"
                                    className="flex-1 bg-transparent border-none p-0 focus:ring-0 font-medium placeholder:text-gray-300 text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={handleCreateCategory}
                                    disabled={creatingCategory}
                                    className="bg-primary text-black text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-60"
                                >
                                    {creatingCategory ? 'Creando...' : 'Crear'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Date Picker */}
                    <div className="bg-white rounded-2xl p-4 flex items-center gap-4 border border-gray-100">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                            <span className="material-symbols-rounded text-gray-500">calendar_today</span>
                        </div>
                        <div className="flex-1">
                            <p className="font-semibold text-sm">Fecha de transacción</p>
                            <p className="text-xs text-gray-400">¿Cuándo ocurrió?</p>
                        </div>
                        <div className="relative">
                            <span className="text-sm font-medium text-gray-600 flex items-center gap-1">
                                {isToday ? 'Hoy' : new Date(date + 'T12:00:00').toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })}
                                <span className="material-symbols-rounded text-sm text-gray-400">expand_more</span>
                            </span>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                        </div>
                    </div>

                    {/* Note */}
                    <div className="bg-white rounded-2xl p-4 border border-gray-100">
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Nota (opcional)"
                            className="w-full bg-transparent border-none p-0 focus:ring-0 font-medium placeholder:text-gray-300 text-sm"
                        />
                    </div>
                </div>

                {/* Submit Button */}
                <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-6 bg-[#f7f9f8]">
                    <button
                        type="submit"
                        disabled={loading || scanning || creatingCategory || !!pendingScan}
                        className="w-full bg-primary hover:bg-primary-dark text-black font-bold py-4 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 text-base shadow-lg shadow-primary/20"
                    >
                        {loading ? (
                            <span className="material-symbols-rounded animate-spin">progress_activity</span>
                        ) : (
                            'Guardar Transacción'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
