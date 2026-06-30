import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db, functions } from '../firebase';
import { toast } from 'react-hot-toast';
import CancelSubscriptionModal from './CancelSubscriptionModal';
import { TRIAL_DAYS } from '../utils/trial';

/**
 * SubscriptionCard — displays current plan, renewal/expiration dates,
 * payment method, pricing, reactivation, and action buttons.
 * Renders inside Profile between Verification and Security cards.
 */
export default function SubscriptionCard({ onOpenPaywall }) {
    const { currentUser, userData, isProUser: isPro, isTrialUser } = useAuth();
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [isReactivating, setIsReactivating] = useState(false);
    const [billingReceipts, setBillingReceipts] = useState([]);

    useEffect(() => {
        if (!currentUser || !db) {
            setBillingReceipts([]);
            return;
        }

        let isMounted = true;
        const loadReceipts = async () => {
            try {
                const receiptsQuery = query(
                    collection(db, 'users', currentUser.uid, 'billingReceipts'),
                    orderBy('paidAt', 'desc'),
                    limit(3)
                );
                const snapshot = await getDocs(receiptsQuery);
                if (!isMounted) return;
                setBillingReceipts(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
            } catch (error) {
                if (isMounted) setBillingReceipts([]);
            }
        };

        loadReceipts();
        return () => {
            isMounted = false;
        };
    }, [currentUser]);

    // ── Helper: parse Firestore timestamp or Date ──
    const parseDate = (val) => {
        if (!val) return null;
        if (val.toDate) return val.toDate();
        return new Date(val);
    };

    // ── Derived state ──
    const planType = userData?.planType || null;
    const cancelAtPeriodEnd = userData?.cancelAtPeriodEnd === true;
    const currentPeriodEnd = parseDate(userData?.currentPeriodEnd);
    const trialEndsAt = parseDate(userData?.trialEndsAt);
    const subscriptionId = userData?.paypalSubscriptionId || null;
    const subscriptionStartDate = parseDate(userData?.subscriptionStartDate);

    // Format date in user's locale
    const formatDate = (date) => {
        if (!date) return '—';
        return new Intl.DateTimeFormat('es', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }).format(date);
    };

    // ── Plan pricing ──
    const getPlanPrice = () => {
        if (planType === 'annual') return '$47.90 USD / año';
        if (planType === 'monthly') return '$4.99 USD / mes';
        return null;
    };

    // ── Determine plan label & status ──
    // CRITICAL: Use `isPro` from useAuth() as single source of truth.
    // Never check `userData?.isPro === true` independently — that breaks
    // for grandfathered users where isPro is undefined in Firestore.
    const getPlanInfo = () => {
        // PRO active (not cancelled, not trial)
        if (isPro && !isTrialUser && !cancelAtPeriodEnd) {
            const cycle = planType === 'annual' ? 'Anual' : (planType === 'monthly' ? 'Mensual' : null);
            return {
                label: cycle ? `Plan PRO (${cycle})` : 'Plan PRO',
                badge: 'pro',
                dateLabel: currentPeriodEnd ? 'Próxima renovación' : null,
                date: currentPeriodEnd || null,
                showCancel: !!subscriptionId,
                showUpgrade: false,
                showChangePlan: !!subscriptionId,
                showReactivate: false,
            };
        }

        // PRO but cancelled (grace period)
        if (isPro && cancelAtPeriodEnd) {
            return {
                label: 'Plan PRO — Cancelado',
                badge: 'cancelled',
                dateLabel: 'Tu plan finaliza el',
                date: currentPeriodEnd,
                showCancel: false,
                showUpgrade: false,
                showChangePlan: false,
                showReactivate: true,
            };
        }

        // Trial active
        if (isTrialUser && trialEndsAt) {
            return {
                label: `Prueba Gratuita (${TRIAL_DAYS} días)`,
                badge: 'trial',
                dateLabel: 'Tu prueba gratis termina el',
                date: trialEndsAt,
                showCancel: false,
                showUpgrade: true,
                showChangePlan: false,
                showReactivate: false,
            };
        }

        // Free user (trial expired or never had one)
        return {
            label: 'Plan Gratuito',
            badge: 'free',
            dateLabel: null,
            date: null,
            showCancel: false,
            showUpgrade: true,
            showChangePlan: false,
            showReactivate: false,
        };
    };

    const plan = getPlanInfo();
    const price = getPlanPrice();

    // ── Badge styles ──
    const badgeStyles = {
        pro: 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white',
        cancelled: 'bg-gradient-to-r from-orange-400 to-red-400 text-white',
        trial: 'bg-gradient-to-r from-blue-400 to-indigo-500 text-white',
        free: 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300',
    };

    const badgeIcons = {
        pro: 'crown',
        cancelled: 'event_busy',
        trial: 'hourglass_top',
        free: 'stars',
    };

    // ── Cancel subscription handler ──
    const handleCancelSubscription = async () => {
        if (!subscriptionId || !currentUser) return;

        setIsCancelling(true);
        try {
            const cancelSubscription = httpsCallable(functions, 'cancelPayPalSubscription');
            await cancelSubscription({ subscriptionId });

            toast.success('Renovación pausada. Mantendrás tu acceso PRO hasta el final de tu ciclo actual.');
            setShowCancelModal(false);
        } catch (error) {
            toast.error('Error al pausar la renovación. Intenta de nuevo más tarde.');
        } finally {
            setIsCancelling(false);
        }
    };

    // ── Reactivate subscription handler ──
    const handleReactivate = async () => {
        if (!currentUser) return;

        setIsReactivating(true);
        try {
            const reactivateSubscription = httpsCallable(functions, 'reactivatePayPalSubscription');
            await reactivateSubscription({ subscriptionId });

            toast.success('¡Suscripción reactivada! Tu plan PRO continúa activo.');
        } catch (error) {
            toast.error('Error al reactivar la suscripción. Intenta de nuevo más tarde.');
        } finally {
            setIsReactivating(false);
        }
    };

    return (
        <>
            <div className="bg-white dark:bg-slate-800 transition-colors duration-200 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-500 flex items-center justify-center transition-colors duration-200">
                            <span className="material-symbols-rounded text-[20px]">card_membership</span>
                        </div>
                        <h3 className="font-semibold text-gray-800 dark:text-zinc-100 transition-colors duration-200">Mi Suscripción</h3>
                    </div>
                    <span className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full ${badgeStyles[plan.badge]}`}>
                        <span className="material-symbols-rounded text-[12px]">{badgeIcons[plan.badge]}</span>
                        {plan.badge === 'pro' ? 'ACTIVO' : plan.badge === 'cancelled' ? 'CANCELADO' : plan.badge === 'trial' ? 'TRIAL' : 'GRATIS'}
                    </span>
                </div>

                {/* Plan Name */}
                <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3 mb-3 transition-colors duration-200">
                    <p className="text-xs text-gray-400 dark:text-slate-500 font-medium mb-0.5 transition-colors duration-200">Plan actual</p>
                    <p className="text-sm font-bold text-gray-800 dark:text-zinc-100 transition-colors duration-200">{plan.label}</p>
                </div>

                {/* Price Row (PRO only) */}
                {price && (plan.badge === 'pro' || plan.badge === 'cancelled') && (
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3 mb-3 transition-colors duration-200">
                        <p className="text-xs text-gray-400 dark:text-slate-500 font-medium mb-0.5 transition-colors duration-200">Precio</p>
                        <p className="text-sm font-bold text-gray-800 dark:text-zinc-100 transition-colors duration-200">
                            <span className="material-symbols-rounded text-[14px] mr-1 align-middle">payments</span>
                            {price}
                        </p>
                    </div>
                )}

                {/* Date Row */}
                {plan.dateLabel && plan.date && (
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3 mb-3 transition-colors duration-200">
                        <p className="text-xs text-gray-400 dark:text-slate-500 font-medium mb-0.5 transition-colors duration-200">{plan.dateLabel}</p>
                        <p className={`text-sm font-bold transition-colors duration-200 ${cancelAtPeriodEnd ? 'text-red-500 dark:text-red-400' : 'text-gray-800 dark:text-zinc-100'}`}>
                            <span className="material-symbols-rounded text-[14px] mr-1 align-middle">
                                {cancelAtPeriodEnd ? 'event_busy' : 'event'}
                            </span>
                            {formatDate(plan.date)}
                        </p>
                    </div>
                )}

                {/* Member Since (PRO only) */}
                {subscriptionStartDate && (plan.badge === 'pro' || plan.badge === 'cancelled') && (
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3 mb-3 transition-colors duration-200">
                        <p className="text-xs text-gray-400 dark:text-slate-500 font-medium mb-0.5 transition-colors duration-200">Miembro desde</p>
                        <p className="text-sm font-bold text-gray-800 dark:text-zinc-100 transition-colors duration-200">
                            <span className="material-symbols-rounded text-[14px] mr-1 align-middle">calendar_month</span>
                            {formatDate(subscriptionStartDate)}
                        </p>
                    </div>
                )}

                {/* Payment Method (PRO only) */}
                {subscriptionId && (plan.badge === 'pro' || plan.badge === 'cancelled') && (
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3 mb-3 flex items-center justify-between transition-colors duration-200">
                        <div>
                            <p className="text-xs text-gray-400 dark:text-slate-500 font-medium mb-0.5 transition-colors duration-200">Método de pago</p>
                            <p className="text-sm font-bold text-gray-800 dark:text-zinc-100 flex items-center gap-1.5 transition-colors duration-200">
                                <span className="material-symbols-rounded text-[14px] align-middle text-blue-600 dark:text-blue-400">account_balance_wallet</span>
                                PayPal
                            </p>
                        </div>
                        <span className="flex items-center text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full transition-colors duration-200">
                            <span className="material-symbols-rounded text-[12px] mr-0.5">check_circle</span>
                            Vinculado
                        </span>
                    </div>
                )}

                {/* Subscription ID (collapsed) */}
                {subscriptionId && (
                    <p className="text-[10px] text-gray-300 dark:text-slate-500 mb-3 truncate transition-colors duration-200">
                        ID: {subscriptionId}
                    </p>
                )}

                {billingReceipts.length > 0 && (
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3 mb-3 transition-colors duration-200">
                        <p className="text-xs text-gray-400 dark:text-slate-500 font-medium mb-2 transition-colors duration-200">Últimos comprobantes PayPal</p>
                        <div className="space-y-2">
                            {billingReceipts.map((receipt) => (
                                <div key={receipt.id} className="flex items-center justify-between gap-3 text-xs">
                                    <div className="min-w-0">
                                        <p className="font-semibold text-gray-800 dark:text-zinc-100 truncate">
                                            {receipt.amount || 'Cobro'} {receipt.currency || ''}
                                        </p>
                                        <p className="text-gray-400 dark:text-slate-500">
                                            {formatDate(parseDate(receipt.paidAt))}
                                        </p>
                                    </div>
                                    <span className="shrink-0 inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-bold">
                                        <span className="material-symbols-rounded text-[13px]">receipt_long</span>
                                        PayPal
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2">
                    {/* Reactivate (grace period only) */}
                    {plan.showReactivate && (
                        <button
                            onClick={handleReactivate}
                            disabled={isReactivating}
                            className="w-full py-2.5 bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 text-white font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
                        >
                            {isReactivating ? (
                                <>
                                    <span className="animate-spin material-symbols-rounded text-[16px]">progress_activity</span>
                                    Reactivando...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-rounded text-[16px]">restart_alt</span>
                                    Reactivar Suscripción
                                </>
                            )}
                        </button>
                    )}

                    {/* Change Plan (PRO active only) */}
                    {plan.showChangePlan && (
                        <button
                            onClick={onOpenPaywall}
                            className="w-full py-2.5 bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 font-medium rounded-xl text-sm transition-colors duration-200 flex items-center justify-center gap-1.5 border border-gray-200 dark:border-slate-600"
                        >
                            <span className="material-symbols-rounded text-[16px]">swap_horiz</span>
                            Cambiar Plan
                        </button>
                    )}

                    {/* Cancel (PRO active only) */}
                    {plan.showCancel && (
                        <button
                            onClick={() => setShowCancelModal(true)}
                            className="w-full py-2.5 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500 dark:text-red-400 font-medium rounded-xl text-sm transition-colors duration-200 flex items-center justify-center gap-1.5"
                        >
                            <span className="material-symbols-rounded text-[16px]">cancel</span>
                            Pausar renovación
                        </button>
                    )}

                    {/* Upgrade (free / trial) */}
                    {plan.showUpgrade && (
                        <button
                            onClick={onOpenPaywall}
                            className="w-full py-2.5 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-1.5 active:scale-[0.98]"
                        >
                            <span className="material-symbols-rounded text-[16px]">crown</span>
                            {plan.badge === 'free' ? 'Mejorar a PRO' : 'Hazte PRO'}
                        </button>
                    )}
                </div>
            </div>

            <CancelSubscriptionModal
                isOpen={showCancelModal}
                onClose={() => setShowCancelModal(false)}
                onConfirm={handleCancelSubscription}
                isLoading={isCancelling}
                periodEndDate={currentPeriodEnd}
            />
        </>
    );
}
