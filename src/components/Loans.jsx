import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLoans } from '../hooks/useLoans';
import BottomNav from './BottomNav';
import PaywallModal from './PaywallModal';

const EMPTY_LOAN = {
    nombrePrestamo: '',
    montoTotalAcordado: '',
    balancePendiente: '',
    tasaInteres: '',
    cuotaMensual: '',
    diaDePago: '',
};

function getLoanAlert(loan) {
    if (loan.pagadoEsteMes) return null;
    const today = new Date();
    const day = today.getDate();
    const payDay = loan.diaDePago || 1;
    const diff = payDay - day;

    if (diff < 0) return { type: 'overdue', label: 'Vencido', color: 'bg-red-500', textColor: 'text-red-600', bgLight: 'bg-red-50', icon: 'error' };
    if (diff <= 5) return { type: 'soon', label: `${diff === 0 ? 'Hoy' : `En ${diff} día${diff > 1 ? 's' : ''}`}`, color: 'bg-amber-500', textColor: 'text-amber-600', bgLight: 'bg-amber-50', icon: 'schedule' };
    return null;
}

export default function Loans() {
    const navigate = useNavigate();
    const { currentUser, isProUser, isTrialUser } = useAuth();
    const canAccessPremium = isProUser || isTrialUser;
    const { loans, loading, addLoan, updateLoan, deleteLoan, markAsPaid, undoPaid, totalDeuda, totalCuotasMensuales } = useLoans(currentUser?.uid);

    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState(EMPTY_LOAN);
    const [editingId, setEditingId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const formatMoney = useCallback((n) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n), []);

    const openAdd = () => {
        setFormData(EMPTY_LOAN);
        setEditingId(null);
        setShowForm(true);
    };

    const openEdit = (loan) => {
        setFormData({
            nombrePrestamo: loan.nombrePrestamo || '',
            montoTotalAcordado: String(loan.montoTotalAcordado || ''),
            balancePendiente: String(loan.balancePendiente || ''),
            tasaInteres: String(loan.tasaInteres || ''),
            cuotaMensual: String(loan.cuotaMensual || ''),
            diaDePago: String(loan.diaDePago || ''),
        });
        setEditingId(loan.id);
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!formData.nombrePrestamo.trim() || !formData.cuotaMensual) return;
        setSaving(true);
        try {
            if (editingId) {
                await updateLoan(editingId, {
                    nombrePrestamo: formData.nombrePrestamo.trim(),
                    montoTotalAcordado: Number(formData.montoTotalAcordado) || 0,
                    balancePendiente: Number(formData.balancePendiente) || 0,
                    tasaInteres: Number(formData.tasaInteres) || 0,
                    cuotaMensual: Number(formData.cuotaMensual) || 0,
                    diaDePago: Number(formData.diaDePago) || 1,
                });
            } else {
                await addLoan(formData);
            }
            setShowForm(false);
            setFormData(EMPTY_LOAN);
            setEditingId(null);
        } catch (e) {
            console.error('Error saving loan:', e);
        }
        setSaving(false);
    };

    const handleDelete = async (id) => {
        await deleteLoan(id);
        setConfirmDelete(null);
    };

    const handleTogglePaid = async (loan) => {
        if (loan.pagadoEsteMes) {
            await undoPaid(loan);
        } else {
            await markAsPaid(loan);
        }
    };

    const [showPaywall, setShowPaywall] = useState(false);

    return (
        <>
            {/* PRO Lock Overlay */}
            {!canAccessPremium && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-6">
                    <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
                        <div className="w-16 h-16 mx-auto bg-amber-100 rounded-full flex items-center justify-center mb-4">
                            <span className="material-symbols-rounded text-amber-500 text-3xl">account_balance</span>
                        </div>
                        <span className="inline-block bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full mb-3">Solo PRO</span>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Módulo de Préstamos</h2>
                        <p className="text-sm text-gray-500 mb-6">
                            Registra préstamos, controla cuotas y recibe alertas de vencimiento con tu suscripción PRO.
                        </p>
                        <button
                            onClick={() => setShowPaywall(true)}
                            className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 text-white font-bold py-3.5 rounded-2xl shadow-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-rounded">crown</span>
                            Desbloquear con PRO
                        </button>
                        <button onClick={() => navigate(-1)} className="mt-3 text-sm text-gray-400 font-medium">
                            Volver
                        </button>
                    </div>
                    <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} />
                </div>
            )}
            <div className="flex flex-col min-h-screen bg-[#f5f7f6]">
                <header className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-[#f5f7f6]/90 backdrop-blur-md px-6 pt-12 pb-4 flex items-center justify-between">
                    <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-black/5 active:scale-95 transition-all">
                        <span className="material-symbols-rounded text-2xl text-gray-800">arrow_back_ios_new</span>
                    </button>
                    <h1 className="text-xl font-bold text-gray-900">Mis Préstamos</h1>
                    <button onClick={openAdd} className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary/10 hover:bg-primary/20 active:scale-95 transition-all">
                        <span className="material-symbols-rounded text-2xl text-primary">add</span>
                    </button>
                </header>

                <div className="pt-28 pb-28 px-5 space-y-5">
                    {/* Summary Card */}
                    <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-[28px] p-6 shadow-lg relative overflow-hidden">
                        <div className="absolute -top-10 -right-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                        <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">Deuda Total Pendiente</p>
                        <p className="text-3xl font-extrabold text-white">RD$ {formatMoney(totalDeuda)}</p>
                        <div className="flex gap-4 mt-3">
                            <div className="bg-white/15 rounded-2xl px-4 py-2">
                                <p className="text-white/70 text-[10px] font-bold uppercase">Cuotas/Mes</p>
                                <p className="text-white font-extrabold text-lg">RD$ {formatMoney(totalCuotasMensuales)}</p>
                            </div>
                            <div className="bg-white/15 rounded-2xl px-4 py-2">
                                <p className="text-white/70 text-[10px] font-bold uppercase">Préstamos</p>
                                <p className="text-white font-extrabold text-lg">{loans.length}</p>
                            </div>
                        </div>
                    </div>

                    {/* Loading */}
                    {loading && (
                        <div className="text-center py-8">
                            <span className="material-symbols-rounded text-4xl text-gray-300 animate-spin">progress_activity</span>
                        </div>
                    )}

                    {/* Empty State */}
                    {!loading && loans.length === 0 && (
                        <div className="text-center py-10 bg-white rounded-[28px] border border-dashed border-gray-200">
                            <span className="material-symbols-rounded text-5xl text-gray-300">account_balance</span>
                            <p className="text-gray-400 text-sm mt-3">No tienes préstamos registrados.</p>
                            <button onClick={openAdd} className="mt-4 text-primary font-bold text-sm">+ Agregar préstamo</button>
                        </div>
                    )}

                    {/* Loans List */}
                    {!loading && loans.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-[17px] font-bold text-gray-900 px-1">Préstamos Activos</h3>
                            {loans.map(loan => {
                                const alert = getLoanAlert(loan);
                                const progress = loan.montoTotalAcordado > 0
                                    ? Math.round(((loan.montoTotalAcordado - loan.balancePendiente) / loan.montoTotalAcordado) * 100)
                                    : 0;

                                return (
                                    <div key={loan.id} className={`bg-white rounded-[24px] p-5 shadow-sm transition-all ${loan.balancePendiente <= 0 ? 'opacity-60' : ''}`}>
                                        {/* Header */}
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${loan.pagadoEsteMes ? 'bg-green-100' : alert ? alert.bgLight : 'bg-amber-100'}`}>
                                                    <span className={`material-symbols-rounded text-xl ${loan.pagadoEsteMes ? 'text-green-500' : alert ? alert.textColor : 'text-amber-500'}`}>
                                                        {loan.pagadoEsteMes ? 'check_circle' : 'account_balance'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-gray-900">{loan.nombrePrestamo}</h4>
                                                    <p className="text-[11px] text-gray-400">Día de pago: {loan.diaDePago} · Tasa: {loan.tasaInteres}%</p>
                                                </div>
                                            </div>
                                            <button onClick={() => openEdit(loan)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
                                                <span className="material-symbols-rounded text-lg text-gray-400">edit</span>
                                            </button>
                                        </div>

                                        {/* Alert Badge */}
                                        {alert && (
                                            <div className={`flex items-center gap-2 ${alert.bgLight} rounded-xl px-3 py-2 mb-3`}>
                                                <span className={`material-symbols-rounded text-lg ${alert.textColor}`}>{alert.icon}</span>
                                                <span className={`text-xs font-bold ${alert.textColor}`}>{alert.label} — Cuota: RD$ {formatMoney(loan.cuotaMensual)}</span>
                                            </div>
                                        )}

                                        {/* Amounts */}
                                        <div className="flex justify-between items-center mb-2">
                                            <div>
                                                <p className="text-xs text-gray-400">Pendiente</p>
                                                <p className="font-extrabold text-gray-800">RD$ {formatMoney(loan.balancePendiente)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-gray-400">Cuota Mensual</p>
                                                <p className="font-extrabold text-gray-800">RD$ {formatMoney(loan.cuotaMensual)}</p>
                                            </div>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                                            <div
                                                className={`h-full rounded-full transition-all duration-700 ${progress >= 80 ? 'bg-green-500' : progress >= 50 ? 'bg-amber-500' : 'bg-primary'}`}
                                                style={{ width: `${Math.min(progress, 100)}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between mb-3">
                                            <span className="text-[10px] font-bold text-gray-400">{progress}% pagado</span>
                                            <span className="text-[10px] text-gray-400">Total: RD$ {formatMoney(loan.montoTotalAcordado)}</span>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleTogglePaid(loan)}
                                                disabled={loan.balancePendiente <= 0}
                                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.97] ${loan.pagadoEsteMes
                                                    ? 'bg-green-50 text-green-600 border border-green-200'
                                                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                                                    } disabled:opacity-40`}
                                            >
                                                <span className="material-symbols-rounded text-lg">{loan.pagadoEsteMes ? 'undo' : 'check'}</span>
                                                {loan.pagadoEsteMes ? 'Deshacer Pago' : 'Marcar Pagado'}
                                            </button>
                                            {confirmDelete === loan.id ? (
                                                <button onClick={() => handleDelete(loan.id)} className="px-4 py-2.5 rounded-2xl bg-red-500 text-white font-bold text-sm active:scale-[0.97] transition-all">
                                                    Confirmar
                                                </button>
                                            ) : (
                                                <button onClick={() => setConfirmDelete(loan.id)} className="w-11 flex items-center justify-center rounded-2xl bg-red-50 hover:bg-red-100 transition-all">
                                                    <span className="material-symbols-rounded text-lg text-red-400">delete</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Add/Edit Modal */}
                {showForm && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center">
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
                        <div className="relative w-full max-w-md bg-white rounded-t-[32px] p-6 pb-10 animate-slide-up">
                            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
                            <h2 className="text-xl font-bold text-gray-900 mb-5">{editingId ? 'Editar Préstamo' : 'Nuevo Préstamo'}</h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Nombre del Préstamo</label>
                                    <input
                                        type="text"
                                        value={formData.nombrePrestamo}
                                        onChange={e => setFormData({ ...formData, nombrePrestamo: e.target.value })}
                                        placeholder="Ej: Préstamo Vehículo"
                                        className="w-full mt-1 bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none border-none focus:ring-2 focus:ring-primary/30"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Monto Total</label>
                                        <input
                                            type="number"
                                            value={formData.montoTotalAcordado}
                                            onChange={e => setFormData({ ...formData, montoTotalAcordado: e.target.value, balancePendiente: editingId ? formData.balancePendiente : e.target.value })}
                                            placeholder="0"
                                            className="w-full mt-1 bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none border-none focus:ring-2 focus:ring-primary/30"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Balance Pendiente</label>
                                        <input
                                            type="number"
                                            value={formData.balancePendiente}
                                            onChange={e => setFormData({ ...formData, balancePendiente: e.target.value })}
                                            placeholder="0"
                                            className="w-full mt-1 bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none border-none focus:ring-2 focus:ring-primary/30"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tasa %</label>
                                        <input
                                            type="number"
                                            value={formData.tasaInteres}
                                            onChange={e => setFormData({ ...formData, tasaInteres: e.target.value })}
                                            placeholder="0"
                                            className="w-full mt-1 bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none border-none focus:ring-2 focus:ring-primary/30"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Cuota RD$</label>
                                        <input
                                            type="number"
                                            value={formData.cuotaMensual}
                                            onChange={e => setFormData({ ...formData, cuotaMensual: e.target.value })}
                                            placeholder="0"
                                            className="w-full mt-1 bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none border-none focus:ring-2 focus:ring-primary/30"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Día Pago</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="31"
                                            value={formData.diaDePago}
                                            onChange={e => setFormData({ ...formData, diaDePago: e.target.value })}
                                            placeholder="15"
                                            className="w-full mt-1 bg-gray-50 rounded-2xl px-4 py-3 text-sm font-medium outline-none border-none focus:ring-2 focus:ring-primary/30"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={saving || !formData.nombrePrestamo.trim() || !formData.cuotaMensual}
                                className="w-full mt-6 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold py-4 rounded-2xl shadow-lg disabled:opacity-50 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                            >
                                {saving ? (
                                    <><span className="material-symbols-rounded animate-spin">progress_activity</span> Guardando...</>
                                ) : (
                                    <><span className="material-symbols-rounded">{editingId ? 'save' : 'add'}</span> {editingId ? 'Guardar Cambios' : 'Agregar Préstamo'}</>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                <BottomNav />
            </div>
        </>
    );
}
