import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { scanReceiptWithAI, getBestCategory } from '../lib/gemini';

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

const normalizeCategoryName = (value) => value.trim().toLowerCase();

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

    // ─── AI-powered receipt scanning ───
    const handleCameraCapture = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setScanning(true);
            setScanProgress('Analizando con IA...');
            setError('');
            setPendingScan(null);

            const scanResult = await scanReceiptWithAI(file);
            console.log('AI Scan Result:', scanResult);

            setScanProgress('Datos extraídos ✓');

            if (scanResult.amount && scanResult.amount > 0) {
                const bestCategory = getBestCategory(scanResult.suggestedCategories);
                setPendingScan({
                    amount: scanResult.amount,
                    currency: scanResult.currency || 'DOP',
                    merchant: scanResult.merchant,
                    category: bestCategory,
                    date: scanResult.date,
                    time: scanResult.time,
                    rnc: scanResult.rnc,
                    ticketNumber: scanResult.ticketNumber,
                    operator: scanResult.operator,
                    location: scanResult.location,
                    details: scanResult.details,
                    confidence: scanResult.confidence,
                });
            } else {
                setError('No se pudo detectar un monto en la imagen. Intenta con otra foto.');
            }
        } catch (err) {
            console.error('AI Scan Error:', err);
            if (err.message?.includes('API key')) {
                setError('Error de configuración de IA. Verifica tu Firebase API key.');
            } else if (err.message?.includes('quota') || err.message?.includes('rate')) {
                setError('Límite de uso de IA alcanzado. Intenta más tarde.');
            } else {
                setError('Error al analizar la imagen. Intenta de nuevo.');
            }
        } finally {
            setScanning(false);
            setScanProgress('');
            e.target.value = '';
        }
    };

    // ─── Custom categories listener ───
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

    // ─── Handlers ───
    const handleAmountChange = (e) => {
        let val = e.target.value;
        val = val.replace(/[^0-9.]/g, '');
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
        // Auto-fill date if detected
        if (pendingScan.date) {
            setDate(pendingScan.date);
        }
        // Auto-fill note with merchant info
        const noteItems = [];
        if (pendingScan.merchant) noteItems.push(pendingScan.merchant);
        if (pendingScan.ticketNumber) noteItems.push(`#${pendingScan.ticketNumber}`);
        if (!note.trim() && noteItems.length > 0) {
            setNote(noteItems.join(' — '));
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
                                capture="environment"
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
                                    {scanning ? 'auto_awesome' : 'photo_camera'}
                                </span>
                                <span className={`text-[8px] font-bold uppercase tracking-wider mt-1 ${scanning ? 'text-primary' : 'text-gray-400'}`}>
                                    {scanning ? 'IA' : 'Escanear'}
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
                                <p className="text-xs text-primary font-medium mt-2 animate-pulse bg-primary/10 px-3 py-1 rounded-full flex items-center gap-1">
                                    <span className="material-symbols-rounded text-sm">auto_awesome</span>
                                    {scanProgress}
                                </p>
                            )}

                            {/* ─── AI Scan Results Card ─── */}
                            {pendingScan && (
                                <div className="mt-4 bg-white border border-primary/20 rounded-2xl p-4 text-left shadow-sm w-full">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="material-symbols-rounded text-primary text-lg">auto_awesome</span>
                                        <p className="text-[10px] uppercase tracking-wider font-semibold text-primary">
                                            Datos detectados por IA
                                        </p>
                                        {pendingScan.confidence > 0 && (
                                            <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${pendingScan.confidence >= 0.8 ? 'bg-green-100 text-green-700' :
                                                    pendingScan.confidence >= 0.5 ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-red-100 text-red-700'
                                                }`}>
                                                {Math.round(pendingScan.confidence * 100)}%
                                            </span>
                                        )}
                                    </div>

                                    {/* Amount */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="material-symbols-rounded text-gray-400 text-base">payments</span>
                                        <p className="text-base font-bold text-gray-800">
                                            {pendingScan.currency === 'DOP' || pendingScan.currency === 'RD$' ? 'RD$' : pendingScan.currency}{' '}
                                            {pendingScan.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>

                                    {/* Merchant */}
                                    {pendingScan.merchant && (
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="material-symbols-rounded text-gray-400 text-base">store</span>
                                            <p className="text-sm font-medium text-gray-700">{pendingScan.merchant}</p>
                                        </div>
                                    )}

                                    {/* RNC */}
                                    {pendingScan.rnc && (
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="material-symbols-rounded text-gray-400 text-base">badge</span>
                                            <p className="text-xs text-gray-500">RNC: {pendingScan.rnc}</p>
                                        </div>
                                    )}

                                    {/* Date & Time */}
                                    {(pendingScan.date || pendingScan.time) && (
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="material-symbols-rounded text-gray-400 text-base">calendar_today</span>
                                            <p className="text-xs text-gray-500">
                                                {pendingScan.date && new Date(pendingScan.date + 'T12:00:00').toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                {pendingScan.time && ` • ${pendingScan.time}`}
                                            </p>
                                        </div>
                                    )}

                                    {/* Ticket Number */}
                                    {pendingScan.ticketNumber && (
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="material-symbols-rounded text-gray-400 text-base">receipt_long</span>
                                            <p className="text-xs text-gray-500">Ticket: {pendingScan.ticketNumber}</p>
                                        </div>
                                    )}

                                    {/* Location */}
                                    {pendingScan.location && (
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="material-symbols-rounded text-gray-400 text-base">location_on</span>
                                            <p className="text-xs text-gray-500">{pendingScan.location}</p>
                                        </div>
                                    )}

                                    {/* Operator */}
                                    {pendingScan.operator && (
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="material-symbols-rounded text-gray-400 text-base">person</span>
                                            <p className="text-xs text-gray-500">Operador: {pendingScan.operator}</p>
                                        </div>
                                    )}

                                    {/* Details */}
                                    {pendingScan.details && (
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="material-symbols-rounded text-gray-400 text-base">info</span>
                                            <p className="text-xs text-gray-500">{pendingScan.details}</p>
                                        </div>
                                    )}

                                    {/* Category suggestion */}
                                    {pendingScan.category && (
                                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                                            <span className="material-symbols-rounded text-gray-400 text-base">category</span>
                                            <p className="text-xs text-gray-500">
                                                Categoría sugerida: <span className="font-semibold text-primary">{pendingScan.category}</span>
                                            </p>
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    <div className="flex gap-2 mt-3">
                                        <button
                                            type="button"
                                            onClick={handleApplyScan}
                                            className="flex-1 bg-primary text-black font-semibold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1"
                                        >
                                            <span className="material-symbols-rounded text-sm">check</span>
                                            Aplicar todo
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleDismissScan}
                                            className="flex-1 bg-gray-100 text-gray-600 font-semibold text-xs py-2.5 rounded-xl"
                                        >
                                            Editar manual
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
