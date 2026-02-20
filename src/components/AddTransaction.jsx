import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

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

    const currentCategories = type === 'expense' ? expenseCategories : incomeCategories;
    const visibleCategories = showAllCats ? currentCategories : currentCategories.slice(0, 6);

    React.useEffect(() => {
        setCategory(currentCategories[0].name);
    }, [type]);

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
                    <div className="text-center py-4">
                        <p className="text-xs text-primary font-semibold tracking-widest uppercase mb-2">Monto</p>
                        <div className="flex items-baseline justify-center">
                            <span className="text-4xl font-bold text-gray-800 mr-1">RD$</span>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={amount}
                                onChange={handleAmountChange}
                                placeholder="0"
                                className="text-5xl font-bold bg-transparent border-none outline-none text-center w-40 p-0 focus:ring-0 placeholder:text-gray-300"
                                autoFocus
                                required
                            />
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
                                    onClick={() => setCategory(cat.name)}
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
                        disabled={loading}
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
