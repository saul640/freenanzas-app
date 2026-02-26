import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTransactions } from '../hooks/useTransactions';
import { formatMoney, getCategoryIcon, getCategoryColor } from '../utils/format';
import { exportExpensesToPdf } from '../utils/exportPdf';
import { exportExpensesToExcel } from '../utils/exportExcel';
import BottomNav from './BottomNav';

export default function ExpenseDetail() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { transactions, loading } = useTransactions(currentUser?.uid);

    // ─── Filters ───
    const [typeFilter, setTypeFilter] = useState('all'); // all | expense | income
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // ─── Filtered transactions ───
    const filtered = useMemo(() => {
        return transactions.filter((tx) => {
            // Type filter
            if (typeFilter !== 'all' && tx.type !== typeFilter) return false;

            // Date filter
            const txDate = tx.date || (tx.timestamp?.toDate ? tx.timestamp.toDate().toISOString().slice(0, 10) : null);
            if (dateFrom && txDate && txDate < dateFrom) return false;
            if (dateTo && txDate && txDate > dateTo) return false;

            return true;
        });
    }, [transactions, typeFilter, dateFrom, dateTo]);

    // ─── Summary ───
    const summary = useMemo(() => {
        const expense = filtered.filter((tx) => tx.type === 'expense').reduce((s, tx) => s + (tx.amount || 0), 0);
        const income = filtered.filter((tx) => tx.type === 'income').reduce((s, tx) => s + (tx.amount || 0), 0);
        return { expense, income, balance: income - expense };
    }, [filtered]);

    // ─── Export handlers ───
    const handleExportPdf = () => {
        if (filtered.length === 0) return;
        exportExpensesToPdf(filtered);
    };

    const handleExportExcel = () => {
        if (filtered.length === 0) return;
        exportExpensesToExcel(filtered);
    };

    const clearFilters = () => {
        setTypeFilter('all');
        setDateFrom('');
        setDateTo('');
    };

    const hasActiveFilters = typeFilter !== 'all' || dateFrom || dateTo;

    const formatTxDate = (tx) => {
        if (tx.timestamp?.toDate) {
            return tx.timestamp.toDate().toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        if (tx.date) {
            return new Date(tx.date + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        return 'Sin fecha';
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#f7f9f8] max-w-md mx-auto relative shadow-2xl overflow-x-hidden pb-32">
            {/* Header */}
            <header className="bg-gradient-to-br from-[#0df259] to-emerald-800 text-black px-6 pt-12 pb-6 rounded-b-[2rem] shadow-lg relative z-10">
                <div className="absolute -top-16 -right-10 w-40 h-40 bg-white/20 rounded-full blur-3xl" aria-hidden="true"></div>
                <div className="absolute -bottom-20 -left-16 w-52 h-52 bg-emerald-900/30 rounded-full blur-3xl" aria-hidden="true"></div>
                <div className="relative z-10">
                    <div className="flex justify-between items-center mb-1">
                        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm font-medium opacity-80 hover:opacity-100 transition-opacity">
                            <span className="material-symbols-rounded text-lg">arrow_back</span>
                            Volver
                        </button>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight mt-2">Detalle de Gastos</h1>
                    <p className="text-sm opacity-80 mt-1">Visualiza y exporta tus transacciones</p>
                </div>
            </header>

            {/* Export & Filter Buttons */}
            <div className="px-6 -mt-4 relative z-20">
                <div className="bg-white rounded-2xl p-3 shadow-lg border border-gray-100 flex items-center gap-2">
                    <button
                        onClick={handleExportPdf}
                        disabled={filtered.length === 0}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-50 text-red-600 font-semibold text-xs transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                    >
                        <span className="material-symbols-rounded text-base">picture_as_pdf</span>
                        PDF
                    </button>
                    <button
                        onClick={handleExportExcel}
                        disabled={filtered.length === 0}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-50 text-green-700 font-semibold text-xs transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                    >
                        <span className="material-symbols-rounded text-base">table_chart</span>
                        Excel
                    </button>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-xs transition-all active:scale-95 ${showFilters || hasActiveFilters ? 'bg-primary/10 text-primary-dark' : 'bg-gray-50 text-gray-600'}`}
                    >
                        <span className="material-symbols-rounded text-base">tune</span>
                        Filtros
                        {hasActiveFilters && (
                            <span className="w-2 h-2 rounded-full bg-primary"></span>
                        )}
                    </button>
                </div>
            </div>

            {/* Filters Panel */}
            {showFilters && (
                <div className="px-6 mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
                        {/* Type Filter */}
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tipo</p>
                            <div className="flex p-1 bg-gray-100 rounded-xl">
                                {[
                                    { key: 'all', label: 'Todos' },
                                    { key: 'expense', label: 'Gastos' },
                                    { key: 'income', label: 'Ingresos' },
                                ].map((opt) => (
                                    <button
                                        key={opt.key}
                                        type="button"
                                        onClick={() => setTypeFilter(opt.key)}
                                        className={`flex-1 py-2 font-semibold rounded-lg transition-all text-xs ${typeFilter === opt.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Date Range */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Desde</p>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="w-full bg-gray-50 rounded-xl border-none p-2.5 text-sm focus:ring-primary/50"
                                />
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Hasta</p>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="w-full bg-gray-50 rounded-xl border-none p-2.5 text-sm focus:ring-primary/50"
                                />
                            </div>
                        </div>

                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className="w-full text-center text-xs text-red-500 font-medium py-1"
                            >
                                Limpiar filtros
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Summary Cards */}
            <div className="px-6 mt-4 grid grid-cols-3 gap-2">
                <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ingresos</p>
                    <p className="text-sm font-bold text-primary mt-1">RD$ {formatMoney(summary.income)}</p>
                </div>
                <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Gastos</p>
                    <p className="text-sm font-bold text-red-500 mt-1">RD$ {formatMoney(summary.expense)}</p>
                </div>
                <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Balance</p>
                    <p className={`text-sm font-bold mt-1 ${summary.balance >= 0 ? 'text-primary-dark' : 'text-red-500'}`}>
                        RD$ {formatMoney(summary.balance)}
                    </p>
                </div>
            </div>

            {/* Results count */}
            <div className="px-6 mt-4 flex items-center justify-between">
                <p className="text-xs text-gray-400 font-medium">
                    {filtered.length} transaccion{filtered.length !== 1 ? 'es' : ''}
                    {hasActiveFilters && ' (filtradas)'}
                </p>
            </div>

            {/* Transaction List */}
            <div className="flex-1 mt-3 px-6 relative z-10 overflow-y-auto">
                {loading ? (
                    <div className="flex justify-center py-10">
                        <span className="material-symbols-rounded animate-spin text-primary text-3xl">progress_activity</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200">
                        <span className="material-symbols-rounded text-4xl text-gray-300 mb-2">search_off</span>
                        <p className="text-gray-400 text-sm mt-2">
                            {transactions.length === 0
                                ? 'No tienes transacciones aún.'
                                : 'No hay transacciones que coincidan con tus filtros.'}
                        </p>
                        {hasActiveFilters && (
                            <button onClick={clearFilters} className="mt-3 text-primary font-medium text-sm">
                                Limpiar filtros
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filtered.map((tx) => (
                            <div key={tx.id} className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-gray-50 transition-all duration-200 hover:shadow-md">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getCategoryColor(tx.category)}`}>
                                        <span className="material-symbols-rounded text-lg">{getCategoryIcon(tx.category)}</span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-sm truncate">{tx.note || tx.category || 'Sin categoría'}</p>
                                        <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5">
                                            <span>{formatTxDate(tx)}</span>
                                            {tx.merchant && (
                                                <>
                                                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                                    <span className="truncate">{tx.merchant}</span>
                                                </>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <span className={`font-bold text-sm shrink-0 ml-2 ${tx.type === 'expense' ? 'text-gray-800' : 'text-primary'}`}>
                                    {tx.type === 'expense' ? '- ' : '+ '}RD$ {formatMoney(tx.amount)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <BottomNav />
        </div>
    );
}
