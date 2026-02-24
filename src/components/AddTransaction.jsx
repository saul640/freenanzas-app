import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, onSnapshot, query, where, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { useLoans } from '../hooks/useLoans';
import { scanReceiptWithAI, getBestCategory, consultPreventiveAI, consultPreventiveAILocal, calcAhorroRecomendado } from '../lib/gemini';

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

const CATEGORY_COLORS = [
    { id: 'blue', bgClass: 'bg-blue-500' },
    { id: 'purple', bgClass: 'bg-purple-500' },
    { id: 'pink', bgClass: 'bg-pink-500' },
    { id: 'red', bgClass: 'bg-red-500' },
    { id: 'orange', bgClass: 'bg-orange-500' },
    { id: 'yellow', bgClass: 'bg-yellow-500' },
    { id: 'green', bgClass: 'bg-green-500' },
    { id: 'emerald', bgClass: 'bg-emerald-500' },
    { id: 'teal', bgClass: 'bg-teal-500' },
    { id: 'cyan', bgClass: 'bg-cyan-500' },
    { id: 'indigo', bgClass: 'bg-indigo-500' },
    { id: 'gray', bgClass: 'bg-gray-500' },
];

const normalizeCategoryName = (value) => value.trim().toLowerCase();
const getCardBalanceDOP = (card) => card.balanceDOP ?? card.balanceALaFecha ?? card.balance ?? 0;

export default function AddTransaction() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const appId = 'finanzas_boveda_dual_v2';

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
    const [merchant, setMerchant] = useState('');
    const [rnc, setRnc] = useState('');
    const [ticketNumber, setTicketNumber] = useState('');
    const [operator, setOperator] = useState('');
    const [location, setLocation] = useState('');
    const [details, setDetails] = useState('');
    const [showExtraFields, setShowExtraFields] = useState(false);

    // Credit Card linking state
    const [isCreditCardPayment, setIsCreditCardPayment] = useState(false);
    const [selectedCardId, setSelectedCardId] = useState('');
    const [customCategories, setCustomCategories] = useState([]);
    const [showCategoryCreator, setShowCategoryCreator] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryColor, setNewCategoryColor] = useState('blue');
    const [creatingCategory, setCreatingCategory] = useState(false);

    // ─── AI Quick-Consult State ───
    const [showAIConsult, setShowAIConsult] = useState(false);
    const [aiItemName, setAiItemName] = useState('');
    const [aiItemPrice, setAiItemPrice] = useState('');
    const [aiResult, setAiResult] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);

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

            const scanResult = await scanReceiptWithAI(file);
            console.log('AI Scan Result:', scanResult);

            setScanProgress('Datos extraídos ✓');

            if (scanResult.amount && scanResult.amount > 0) {
                const bestCategory = getBestCategory(scanResult.suggestedCategories);
                setAmount(scanResult.amount.toString());
                if (bestCategory && mergedCategories.some((cat) => cat.name === bestCategory)) {
                    setCategory(bestCategory);
                }
                if (scanResult.date) setDate(scanResult.date);
                if (scanResult.merchant) setMerchant(scanResult.merchant);
                if (scanResult.rnc) setRnc(scanResult.rnc);
                if (scanResult.ticketNumber) setTicketNumber(scanResult.ticketNumber);
                if (scanResult.operator) setOperator(scanResult.operator);
                if (scanResult.location) setLocation(scanResult.location);
                if (scanResult.details) setDetails(scanResult.details);

                if (scanResult.merchant || scanResult.rnc || scanResult.ticketNumber || scanResult.operator || scanResult.location || scanResult.details) {
                    setShowExtraFields(true);
                }
            } else {
                setError('No se pudo detectar un monto en la imagen. Intenta con otra foto.');
            }
        } catch (err) {
            console.error('AI Scan Error:', err);
            if (err.message?.includes('API key')) {
                setError('Error de configuración de IA. Verifica tu Gemini API key.');
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
                    color: item.color || 'gray',
                })));
            },
            (err) => {
                console.error('Error cargando categorias', err);
            }
        );

        return () => unsubscribe();
    }, [currentUser]);

    // ─── Financial data for AI consult ───
    const { loans, totalDeuda: totalLoanDebt } = useLoans(currentUser?.uid);
    const [budgetLimit, setBudgetLimit] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [creditCards, setCreditCards] = useState([]);
    const [recurringItems, setRecurringItems] = useState([]);

    useEffect(() => {
        if (!currentUser || !db) return;
        const mk = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        getDoc(doc(db, 'users', currentUser.uid, 'budgets', mk)).then(s => { if (s.exists()) setBudgetLimit(s.data().globalLimit || 0); }).catch(() => { });
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser || !db) return;
        return onSnapshot(query(collection(db, 'transactions'), where('userId', '==', currentUser.uid)), snap => {
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser || !db || !appId) {
            setCreditCards([]);
            return;
        }
        return onSnapshot(collection(db, 'users', currentUser.uid, 'creditCards'), snap => {
            setCreditCards(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [currentUser, appId]);

    useEffect(() => {
        if (!currentUser || !db) return;
        return onSnapshot(collection(db, 'users', currentUser.uid, 'recurring'), snap => {
            setRecurringItems(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.active));
        });
    }, [currentUser]);

    const { budgetSpent, monthlyIncome, categorySpending } = useMemo(() => {
        const now = new Date();
        let spent = 0, income = 0;
        const catMap = {};
        transactions.forEach(tx => {
            const d = tx.timestamp?.toDate ? tx.timestamp.toDate() : tx.date ? new Date(tx.date) : null;
            if (!d || d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return;
            if (tx.type === 'income') income += tx.amount;
            else {
                spent += tx.amount;
                const c = tx.category || 'Otros';
                if (!catMap[c]) catMap[c] = { name: c, amount: 0 };
                catMap[c].amount += tx.amount;
            }
        });
        return { budgetSpent: spent, monthlyIncome: income, categorySpending: Object.values(catMap) };
    }, [transactions]);

    const totalCardDebt = useMemo(() => creditCards.reduce((s, c) => s + getCardBalanceDOP(c), 0), [creditCards]);
    const cardBalanceAlCorte = useMemo(() => creditCards.reduce((s, c) => s + (c.balanceAlCorte || 0), 0), [creditCards]);
    const credimasTotalAdeudado = useMemo(() => creditCards.reduce((s, c) => s + (c.credimasTotalAdeudado || 0), 0), [creditCards]);

    // ─── Cash Flow: overdue + upcoming payments ───
    const { cuotasVencidas, cuotasProximasAVencer } = useMemo(() => {
        const now = new Date();
        const todayDay = now.getDate();
        const curMK = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        let vencidas = 0, proximas = 0;

        // Recurring expenses
        recurringItems.forEach(r => {
            const paidSet = new Set(r.paidMonths || []);
            const dueDay = r.dueDay || 15;
            if (!paidSet.has(curMK)) {
                if (todayDay > dueDay) vencidas += (r.amount || 0);
                else if (dueDay - todayDay <= 15) proximas += (r.amount || 0);
            }
        });

        // Loans not paid this month
        (loans || []).forEach(l => {
            if (l.pagadoEsteMes) return;
            const dueDay = l.diaDePago || 15;
            if (todayDay > dueDay) vencidas += (l.cuotaMensual || 0);
            else if (dueDay - todayDay <= 15) proximas += (l.cuotaMensual || 0);
        });

        // Credit card payments due
        creditCards.forEach(c => {
            const dueDay = c.fechaLimitePago || c.paymentDueDay || 25;
            const bal = c.balanceAlCorte || 0;
            if (bal > 0) {
                if (todayDay > dueDay) vencidas += bal;
                else if (dueDay - todayDay <= 15) proximas += bal;
            }
        });

        return { cuotasVencidas: vencidas, cuotasProximasAVencer: proximas };
    }, [recurringItems, loans, creditCards]);

    const totalDeudaGlobal = totalCardDebt + totalLoanDebt + credimasTotalAdeudado;
    const ahorroRecomendado = useMemo(() => calcAhorroRecomendado(monthlyIncome, totalDeudaGlobal), [monthlyIncome, totalDeudaGlobal]);

    const handleAIConsult = async () => {
        if (!aiItemName.trim() || !aiItemPrice) return;
        setAiLoading(true);
        const payload = {
            itemName: aiItemName.trim(), itemPrice: parseFloat(aiItemPrice) || 0,
            budgetLimit, budgetSpent, totalLoanDebt, totalCardDebt,
            cardBalanceAlCorte, credimasTotalAdeudado, monthlyIncome, categorySpending,
            cuotasVencidas, cuotasProximasAVencer, ahorroRecomendado,
        };
        try {
            const result = await consultPreventiveAI(payload);
            setAiResult(result);
        } catch (e) {
            console.warn('Gemini preventive AI failed, using local:', e.message);
            setAiResult(consultPreventiveAILocal(payload));
        }
        setAiLoading(false);
    };

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
        if (error) setError('');
    };

    const handleCategorySelect = (value) => {
        setCategory(value);
        if (error) setError('');
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
                color: newCategoryColor,
                createdAt: serverTimestamp(),
            });
            setCategory(trimmedName);
            setNewCategoryName('');
            setNewCategoryColor('blue');
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
        if (!category) {
            setError('Por favor selecciona una categoría.');
            return;
        }

        if (type === 'expense' && isCreditCardPayment && !selectedCardId) {
            setError('Por favor selecciona una tarjeta de crédito.');
            return;
        }

        try {
            setLoading(true);
            setError('');

            if (db && currentUser) {
                const txData = {
                    userId: currentUser.uid,
                    type,
                    amount: parsedAmount,
                    category,
                    date,
                    note: note.trim(),
                    merchant: merchant.trim(),
                    rnc: rnc.trim(),
                    ticketNumber: ticketNumber.trim(),
                    operator: operator.trim(),
                    location: location.trim(),
                    details: details.trim(),
                    timestamp: serverTimestamp()
                };

                if (type === 'expense' && isCreditCardPayment && selectedCardId) {
                    txData.tarjetaCreditoId = selectedCardId;
                    txData.metodoPago = 'tarjeta';
                }

                await addDoc(collection(db, 'transactions'), txData);

                // Update Credit Card Balance
                if (type === 'expense' && isCreditCardPayment && selectedCardId) {
                    const card = creditCards.find(c => c.id === selectedCardId);
                    if (card) {
                        const currentBalance = Number(card.balanceDOP || card.balanceALaFecha || card.balance || 0);
                        const newBalance = currentBalance + parsedAmount;
                        const cardRef = doc(db, 'users', currentUser.uid, 'creditCards', selectedCardId);
                        await updateDoc(cardRef, {
                            ...(card.balanceDOP !== undefined && { balanceDOP: newBalance }),
                            ...(card.balanceALaFecha !== undefined && { balanceALaFecha: newBalance }),
                            ...(card.balance !== undefined && { balance: newBalance })
                        }).catch(console.error);
                    }
                }
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
                            <div className="mt-3 bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                                    <input
                                        type="text"
                                        value={newCategoryName}
                                        onChange={(e) => setNewCategoryName(e.target.value)}
                                        placeholder="Nombre de categoria"
                                        className="flex-1 bg-transparent border-none p-0 focus:ring-0 font-medium text-gray-800 placeholder:text-gray-300 text-sm"
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <p className="text-xs font-semibold text-gray-500 mb-2">Color representativo</p>
                                    <div className="flex flex-wrap gap-2">
                                        {CATEGORY_COLORS.map(c => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() => setNewCategoryColor(c.id)}
                                                className={`w-8 h-8 rounded-full ${c.bgClass} flex items-center justify-center transition-transform hover:scale-110 active:scale-95 ${newCategoryColor === c.id ? 'ring-2 ring-offset-2 ring-gray-900 scale-110' : 'opacity-80'}`}
                                            >
                                                {newCategoryColor === c.id && <span className="material-symbols-rounded text-white text-[16px] font-bold">check</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleCreateCategory}
                                    disabled={creatingCategory || !newCategoryName.trim()}
                                    className="mt-2 w-full bg-primary text-black text-sm font-bold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                                >
                                    {creatingCategory ? 'Creando...' : 'Guardar Categoría'}
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

                    {/* Credit Card Linking Toggle */}
                    {type === 'expense' && creditCards.length > 0 && (
                        <div className="bg-white rounded-2xl p-4 border border-gray-100 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                                        <span className="material-symbols-rounded text-orange-500">credit_card</span>
                                    </div>
                                    <div>
                                        <p className="font-semibold text-sm text-gray-800">¿Pagado con Tarjeta?</p>
                                        <p className="text-[10px] text-gray-400">Sumará a la deuda de la tarjeta</p>
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isCreditCardPayment}
                                        onChange={(e) => {
                                            setIsCreditCardPayment(e.target.checked);
                                            if (!e.target.checked) setSelectedCardId('');
                                            else if (creditCards.length === 1) setSelectedCardId(creditCards[0].id);
                                        }}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500 border border-gray-100"></div>
                                </label>
                            </div>

                            {isCreditCardPayment && (
                                <div className="pt-2 border-t border-gray-50 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <select
                                        value={selectedCardId}
                                        onChange={(e) => setSelectedCardId(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-100 text-gray-900 text-sm rounded-xl focus:ring-orange-500 focus:border-orange-500 block p-3 font-medium outline-none appearance-none"
                                    >
                                        <option value="" disabled>Selecciona una tarjeta...</option>
                                        {creditCards.map(c => (
                                            <option key={c.id} value={c.id}>💳 {c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Detalles Extra Toggle */}
                    <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-gray-100 cursor-pointer" onClick={() => setShowExtraFields(!showExtraFields)}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <span className="material-symbols-rounded text-primary">receipt_long</span>
                            </div>
                            <div>
                                <p className="font-semibold text-sm">Detalles adicionales</p>
                                <p className="text-xs text-gray-400">Comercio, RNC, Ticket...</p>
                            </div>
                        </div>
                        <span className={`material-symbols-rounded text-gray-400 transition-transform ${showExtraFields ? 'rotate-180' : ''}`}>expand_more</span>
                    </div>

                    {/* Extra Fields Container */}
                    {showExtraFields && (
                        <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            {/* Merchant */}
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Comercio</label>
                                <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Ej. Supermercado Bravo" className="w-full bg-gray-50 rounded-xl border-none p-3 focus:ring-primary/50 text-sm" />
                            </div>
                            {/* RNC */}
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">RNC</label>
                                <input type="text" value={rnc} onChange={(e) => setRnc(e.target.value)} placeholder="Ej. 130123456" className="w-full bg-gray-50 rounded-xl border-none p-3 focus:ring-primary/50 text-sm" />
                            </div>
                            {/* Ticket Number */}
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">No. Ticket</label>
                                <input type="text" value={ticketNumber} onChange={(e) => setTicketNumber(e.target.value)} placeholder="Ej. TCK-00123" className="w-full bg-gray-50 rounded-xl border-none p-3 focus:ring-primary/50 text-sm" />
                            </div>
                            {/* Operator */}
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Cajero / Operador</label>
                                <input type="text" value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Ej. Juan Pérez" className="w-full bg-gray-50 rounded-xl border-none p-3 focus:ring-primary/50 text-sm" />
                            </div>
                            {/* Location */}
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Ubicación</label>
                                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ej. Sucursal Winston Churchill" className="w-full bg-gray-50 rounded-xl border-none p-3 focus:ring-primary/50 text-sm" />
                            </div>
                            {/* Details */}
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Otros Detalles</label>
                                <input type="text" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Ej. Placa A123456" className="w-full bg-gray-50 rounded-xl border-none p-3 focus:ring-primary/50 text-sm" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Submit Button */}
                <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-6 bg-[#f7f9f8]">
                    {/* AI Quick-Consult Button */}
                    {type === 'expense' && (
                        <button
                            type="button"
                            onClick={() => { setAiItemName(note || ''); setAiItemPrice(amount || ''); setAiResult(null); setShowAIConsult(true); }}
                            className="w-full mb-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold py-3 rounded-2xl active:scale-[0.98] transition-transform flex items-center justify-center gap-2 text-sm shadow-md"
                        >
                            <span className="material-symbols-rounded text-lg">smart_toy</span>
                            ¿Debería comprar esto? Consultar IA 🤖
                        </button>
                    )}
                    <button
                        type="submit"
                        disabled={loading || scanning || creatingCategory}
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

            {/* ══════════ AI CONSULT MODAL ══════════ */}
            {showAIConsult && (
                <div className="fixed inset-0 z-50 flex items-end justify-center">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAIConsult(false)} />
                    <div className="relative w-full max-w-md bg-white rounded-t-[32px] p-6 pb-8 max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
                        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
                        <div className="flex items-center gap-2 mb-4">
                            <span className="material-symbols-rounded text-cyan-500 text-2xl">smart_toy</span>
                            <h2 className="text-lg font-extrabold text-gray-900">Filtro Preventivo IA</h2>
                        </div>

                        <div className="space-y-3 mb-5">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">¿Qué quieres comprar?</label>
                                <input value={aiItemName} onChange={e => setAiItemName(e.target.value)} placeholder="Ej. AirPods, cena, zapatos..." className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">¿Cuánto cuesta? (RD$)</label>
                                <input type="number" value={aiItemPrice} onChange={e => setAiItemPrice(e.target.value)} placeholder="0" className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none" />
                            </div>
                        </div>

                        <button onClick={handleAIConsult} disabled={aiLoading || !aiItemName.trim() || !aiItemPrice} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold py-3.5 rounded-2xl disabled:opacity-50 active:scale-[0.98] transition-transform flex items-center justify-center gap-2 mb-5">
                            {aiLoading ? (
                                <><span className="material-symbols-rounded animate-spin text-lg">progress_activity</span> Analizando...</>
                            ) : (
                                <><span className="material-symbols-rounded text-lg">auto_awesome</span> Analizar Compra</>
                            )}
                        </button>

                        {/* AI Result */}
                        {aiResult && (
                            <div className="space-y-3 animate-in fade-in duration-300">
                                {/* Traffic Light Semaphore */}
                                <div className="flex items-center justify-center gap-3 py-2">
                                    <div className={`w-5 h-5 rounded-full transition-all duration-500 ${aiResult.nivelRiesgo === 'rojo' ? 'bg-red-500 shadow-lg shadow-red-500/50 scale-125' : 'bg-red-200'}`} />
                                    <div className={`w-5 h-5 rounded-full transition-all duration-500 ${aiResult.nivelRiesgo === 'amarillo' ? 'bg-amber-400 shadow-lg shadow-amber-400/50 scale-125' : 'bg-amber-200'}`} />
                                    <div className={`w-5 h-5 rounded-full transition-all duration-500 ${aiResult.nivelRiesgo === 'verde' ? 'bg-green-500 shadow-lg shadow-green-500/50 scale-125' : 'bg-green-200'}`} />
                                </div>

                                <div className={`rounded-2xl p-5 ${aiResult.nivelRiesgo === 'verde' ? 'bg-green-50 border border-green-100' : aiResult.nivelRiesgo === 'amarillo' ? 'bg-amber-50 border border-amber-100' : 'bg-red-50 border border-red-100'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-2xl">{aiResult.emoji}</span>
                                        <span className={`font-extrabold text-lg uppercase ${aiResult.nivelRiesgo === 'verde' ? 'text-green-700' : aiResult.nivelRiesgo === 'amarillo' ? 'text-amber-700' : 'text-red-700'}`}>
                                            {aiResult.recomendacion === 'comprar' ? '¡Puedes comprar!' : aiResult.recomendacion === 'posponer' ? 'Mejor posponer' : 'Evitar esta compra'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-700 leading-relaxed">{aiResult.razon}</p>
                                </div>

                                {aiResult.detalleFinanciero && (
                                    <div className="bg-gray-50 rounded-xl p-3 flex items-start gap-2">
                                        <span className="material-symbols-rounded text-gray-400 text-lg">account_balance</span>
                                        <p className="text-xs text-gray-600">{aiResult.detalleFinanciero}</p>
                                    </div>
                                )}

                                {aiResult.alternativa && (
                                    <div className="bg-blue-50 rounded-xl p-3 flex items-start gap-2">
                                        <span className="material-symbols-rounded text-blue-400 text-lg">lightbulb</span>
                                        <p className="text-xs text-blue-700">{aiResult.alternativa}</p>
                                    </div>
                                )}

                                {aiResult.impactoDeuda && (
                                    <div className="bg-orange-50 rounded-xl p-3 flex items-start gap-2">
                                        <span className="material-symbols-rounded text-orange-400 text-lg">warning</span>
                                        <p className="text-xs text-orange-700">{aiResult.impactoDeuda}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
