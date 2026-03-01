import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'react-hot-toast';
import CancelSubscriptionModal from './CancelSubscriptionModal';

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
    const getPlanInfo = () => {
        // PRO active (not cancelled)
        if (isPro && userData?.isPro === true && !cancelAtPeriodEnd) {
            const cycle = planType === 'annual' ? 'Anual' : 'Mensual';
            return {
                label: `Plan PRO (${cycle})`,
                badge: 'pro',
                dateLabel: 'Próxima renovación',
                date: currentPeriodEnd,
                showCancel: true,
                showUpgrade: false,
                showChangePlan: true,
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
                label: 'Prueba Gratuita (7 días)',
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
        free: 'bg-gray-100 text-gray-500',
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
            const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
            const paypalSecret = import.meta.env.VITE_PAYPAL_SECRET;

            if (paypalSecret && paypalClientId) {
                const tokenRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic ' + btoa(`${paypalClientId}:${paypalSecret}`),
                    },
                    body: 'grant_type=client_credentials',
                });

                if (tokenRes.ok) {
                    const tokenData = await tokenRes.json();
                    const accessToken = tokenData.access_token;

                    const suspendRes = await fetch(
                        `https://api-m.paypal.com/v1/billing/subscriptions/${subscriptionId}/suspend`,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${accessToken}`,
                            },
                            body: JSON.stringify({ reason: 'Cancelado por el usuario desde la app' }),
                        }
                    );

                    if (!suspendRes.ok && suspendRes.status !== 204) {
                        throw new Error(`PayPal suspend failed: ${suspendRes.status}`);
                    }
                }
            }

            const userRef = doc(db, 'users', currentUser.uid);
            await updateDoc(userRef, {
                cancelAtPeriodEnd: true,
            });

            toast.success('Suscripción cancelada. Mantendrás tu acceso PRO hasta el final de tu ciclo actual.');
            setShowCancelModal(false);
        } catch (error) {
            toast.error('Error al cancelar la suscripción. Intenta de nuevo más tarde.');
        } finally {
            setIsCancelling(false);
        }
    };

    // ── Reactivate subscription handler ──
    const handleReactivate = async () => {
        if (!currentUser) return;

        setIsReactivating(true);
        try {
            // Reactivate on PayPal if we have a subscription ID
            const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
            const paypalSecret = import.meta.env.VITE_PAYPAL_SECRET;

            if (subscriptionId && paypalSecret && paypalClientId) {
                const tokenRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic ' + btoa(`${paypalClientId}:${paypalSecret}`),
                    },
                    body: 'grant_type=client_credentials',
                });

                if (tokenRes.ok) {
                    const tokenData = await tokenRes.json();
                    const accessToken = tokenData.access_token;

                    const activateRes = await fetch(
                        `https://api-m.paypal.com/v1/billing/subscriptions/${subscriptionId}/activate`,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${accessToken}`,
                            },
                            body: JSON.stringify({ reason: 'Reactivado por el usuario desde la app' }),
                        }
                    );

                    if (!activateRes.ok && activateRes.status !== 204) {
                        throw new Error(`PayPal activate failed: ${activateRes.status}`);
                    }
                }
            }

            // Update Firestore — only change existing field, no new fields
            const userRef = doc(db, 'users', currentUser.uid);
            await updateDoc(userRef, {
                cancelAtPeriodEnd: false,
            });

            toast.success('¡Suscripción reactivada! Tu plan PRO continúa activo.');
        } catch (error) {
            toast.error('Error al reactivar la suscripción. Intenta de nuevo más tarde.');
        } finally {
            setIsReactivating(false);
        }
    };

    return (
        <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">
                            <span className="material-symbols-rounded text-[20px]">card_membership</span>
                        </div>
                        <h3 className="font-semibold text-gray-800">Mi Suscripción</h3>
                    </div>
                    <span className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full ${badgeStyles[plan.badge]}`}>
                        <span className="material-symbols-rounded text-[12px]">{badgeIcons[plan.badge]}</span>
                        {plan.badge === 'pro' ? 'ACTIVO' : plan.badge === 'cancelled' ? 'CANCELADO' : plan.badge === 'trial' ? 'TRIAL' : 'GRATIS'}
                    </span>
                </div>

                {/* Plan Name */}
                <div className="bg-gray-50 rounded-xl p-3 mb-3">
                    <p className="text-xs text-gray-400 font-medium mb-0.5">Plan actual</p>
                    <p className="text-sm font-bold text-gray-800">{plan.label}</p>
                </div>

                {/* Price Row (PRO only) */}
                {price && (plan.badge === 'pro' || plan.badge === 'cancelled') && (
                    <div className="bg-gray-50 rounded-xl p-3 mb-3">
                        <p className="text-xs text-gray-400 font-medium mb-0.5">Precio</p>
                        <p className="text-sm font-bold text-gray-800">
                            <span className="material-symbols-rounded text-[14px] mr-1 align-middle">payments</span>
                            {price}
                        </p>
                    </div>
                )}

                {/* Date Row */}
                {plan.dateLabel && plan.date && (
                    <div className="bg-gray-50 rounded-xl p-3 mb-3">
                        <p className="text-xs text-gray-400 font-medium mb-0.5">{plan.dateLabel}</p>
                        <p className={`text-sm font-bold ${cancelAtPeriodEnd ? 'text-red-500' : 'text-gray-800'}`}>
                            <span className="material-symbols-rounded text-[14px] mr-1 align-middle">
                                {cancelAtPeriodEnd ? 'event_busy' : 'event'}
                            </span>
                            {formatDate(plan.date)}
                        </p>
                    </div>
                )}

                {/* Member Since (PRO only) */}
                {subscriptionStartDate && (plan.badge === 'pro' || plan.badge === 'cancelled') && (
                    <div className="bg-gray-50 rounded-xl p-3 mb-3">
                        <p className="text-xs text-gray-400 font-medium mb-0.5">Miembro desde</p>
                        <p className="text-sm font-bold text-gray-800">
                            <span className="material-symbols-rounded text-[14px] mr-1 align-middle">calendar_month</span>
                            {formatDate(subscriptionStartDate)}
                        </p>
                    </div>
                )}

                {/* Payment Method (PRO only) */}
                {subscriptionId && (plan.badge === 'pro' || plan.badge === 'cancelled') && (
                    <div className="bg-gray-50 rounded-xl p-3 mb-3 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-400 font-medium mb-0.5">Método de pago</p>
                            <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                                <span className="material-symbols-rounded text-[14px] align-middle text-blue-600">account_balance_wallet</span>
                                PayPal
                            </p>
                        </div>
                        <span className="flex items-center text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                            <span className="material-symbols-rounded text-[12px] mr-0.5">check_circle</span>
                            Vinculado
                        </span>
                    </div>
                )}

                {/* Subscription ID (collapsed) */}
                {subscriptionId && (
                    <p className="text-[10px] text-gray-300 mb-3 truncate">
                        ID: {subscriptionId}
                    </p>
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
                            className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium rounded-xl text-sm transition-colors flex items-center justify-center gap-1.5 border border-gray-200"
                        >
                            <span className="material-symbols-rounded text-[16px]">swap_horiz</span>
                            Cambiar Plan
                        </button>
                    )}

                    {/* Cancel (PRO active only) */}
                    {plan.showCancel && (
                        <button
                            onClick={() => setShowCancelModal(true)}
                            className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-500 font-medium rounded-xl text-sm transition-colors flex items-center justify-center gap-1.5"
                        >
                            <span className="material-symbols-rounded text-[16px]">cancel</span>
                            Cancelar Suscripción
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
