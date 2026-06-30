import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';

initializeApp();

const geminiApiKey = defineSecret('GEMINI_API_KEY');
const paypalClientId = defineSecret('PAYPAL_CLIENT_ID');
const paypalSecret = defineSecret('PAYPAL_SECRET');
const paypalWebhookId = defineSecret('PAYPAL_WEBHOOK_ID');
const MODEL_NAME = 'gemini-2.5-flash';
const PAYPAL_LIVE_API_BASE = 'https://api-m.paypal.com';
const PAYPAL_SANDBOX_API_BASE = 'https://api-m.sandbox.paypal.com';
const ALLOWED_CORS_ORIGINS = [
    'https://freenanzas-app.web.app',
    'https://freenanzas-app.firebaseapp.com',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
];

const getPaypalApiBase = () => (
    process.env.PAYPAL_ENV === 'sandbox'
        ? PAYPAL_SANDBOX_API_BASE
        : PAYPAL_LIVE_API_BASE
);

const getPaypalAccessToken = async () => {
    const clientId = paypalClientId.value();
    const secret = paypalSecret.value();
    if (!clientId || !secret) {
        throw new Error('PayPal credentials are not configured.');
    }

    const response = await fetch(`${getPaypalApiBase()}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
        throw new Error(`PayPal token request failed (${response.status}).`);
    }

    return data.access_token;
};

const callPaypal = async (path, { method = 'GET', body } = {}) => {
    const accessToken = await getPaypalAccessToken();
    const response = await fetch(`${getPaypalApiBase()}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) return null;

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
        throw new Error(`PayPal API request failed (${response.status}): ${text}`);
    }

    return data;
};

const verifyPaypalWebhook = async (req, webhookEvent) => {
    const webhookId = paypalWebhookId.value();
    if (!webhookId) {
        throw new Error('PayPal webhook ID is not configured.');
    }

    const verification = await callPaypal('/v1/notifications/verify-webhook-signature', {
        method: 'POST',
        body: {
            auth_algo: req.get('PAYPAL-AUTH-ALGO'),
            cert_url: req.get('PAYPAL-CERT-URL'),
            transmission_id: req.get('PAYPAL-TRANSMISSION-ID'),
            transmission_sig: req.get('PAYPAL-TRANSMISSION-SIG'),
            transmission_time: req.get('PAYPAL-TRANSMISSION-TIME'),
            webhook_id: webhookId,
            webhook_event: webhookEvent,
        },
    });

    return verification?.verification_status === 'SUCCESS';
};

const parseCustomId = (customId) => {
    if (typeof customId !== 'string') return {};
    const [userId, requestedPlanType] = customId.split('|');
    if (!userId || !/^[A-Za-z0-9_-]+$/.test(userId)) return {};

    return {
        userId,
        planType: ['monthly', 'annual'].includes(requestedPlanType) ? requestedPlanType : null,
    };
};

const getSubscription = async (subscriptionId) => {
    if (!subscriptionId || typeof subscriptionId !== 'string') {
        throw new Error('Missing PayPal subscription ID.');
    }

    return callPaypal(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
};

const getPeriodEnd = (subscription) => {
    const nextBillingTime = subscription?.billing_info?.next_billing_time;
    if (!nextBillingTime) return null;

    const date = new Date(nextBillingTime);
    return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
};

const activateUserSubscription = async ({ userId, subscription, planType, eventId }) => {
    const db = getFirestore();
    const userRef = db.doc(`users/${userId}`);
    const now = FieldValue.serverTimestamp();

    await userRef.set({
        isPro: true,
        paypalSubscriptionId: subscription.id,
        paypalStatus: subscription.status || 'ACTIVE',
        planType,
        currentPeriodEnd: getPeriodEnd(subscription),
        cancelAtPeriodEnd: false,
        subscriptionStartDate: subscription.start_time
            ? Timestamp.fromDate(new Date(subscription.start_time))
            : now,
        subscriptionUpdatedAt: now,
        lastPaypalWebhookEventId: eventId || null,
    }, { merge: true });
};

const setUserSubscriptionStatus = async ({ userId, subscription, updates, eventId }) => {
    const db = getFirestore();
    await db.doc(`users/${userId}`).set({
        paypalSubscriptionId: subscription.id,
        paypalStatus: subscription.status || null,
        currentPeriodEnd: getPeriodEnd(subscription),
        subscriptionUpdatedAt: FieldValue.serverTimestamp(),
        lastPaypalWebhookEventId: eventId || null,
        ...updates,
    }, { merge: true });
};

const handleSubscriptionWebhook = async (event) => {
    const resource = event?.resource || {};
    const subscriptionId = resource.id || resource.billing_agreement_id;
    if (!subscriptionId) return;

    const subscription = await getSubscription(subscriptionId);
    const { userId, planType } = parseCustomId(subscription.custom_id || resource.custom_id);
    if (!userId) {
        throw new Error(`Unable to map PayPal subscription ${subscriptionId} to a Firebase user.`);
    }

    const effectivePlanType = planType || null;

    switch (event.event_type) {
        case 'BILLING.SUBSCRIPTION.ACTIVATED':
        case 'BILLING.SUBSCRIPTION.RE-ACTIVATED':
            if (!['ACTIVE', 'APPROVAL_PENDING'].includes(subscription.status)) {
                throw new Error(`Unexpected PayPal subscription status: ${subscription.status}`);
            }
            await activateUserSubscription({
                userId,
                subscription,
                planType: effectivePlanType,
                eventId: event.id,
            });
            break;
        case 'BILLING.SUBSCRIPTION.CANCELLED':
        case 'BILLING.SUBSCRIPTION.EXPIRED':
            await setUserSubscriptionStatus({
                userId,
                subscription,
                eventId: event.id,
                updates: {
                    isPro: false,
                    cancelAtPeriodEnd: false,
                },
            });
            break;
        case 'BILLING.SUBSCRIPTION.SUSPENDED':
            await setUserSubscriptionStatus({
                userId,
                subscription,
                eventId: event.id,
                updates: {
                    cancelAtPeriodEnd: true,
                },
            });
            break;
        case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
            await setUserSubscriptionStatus({
                userId,
                subscription,
                eventId: event.id,
                updates: {
                    paypalPaymentFailedAt: FieldValue.serverTimestamp(),
                },
            });
            break;
        default:
            break;
    }
};

const isValidPart = (part) => {
    if (!part || typeof part !== 'object' || Array.isArray(part)) return false;
    if (typeof part.text === 'string') return true;

    const inlineData = part.inlineData;
    return Boolean(
        inlineData
        && typeof inlineData === 'object'
        && typeof inlineData.data === 'string'
        && ['image/png', 'image/jpeg'].includes(inlineData.mimeType)
    );
};

const isValidContents = (contents) => (
    Array.isArray(contents)
    && contents.length > 0
    && contents.every((content) => (
        content
        && typeof content === 'object'
        && Array.isArray(content.parts)
        && content.parts.length > 0
        && content.parts.every(isValidPart)
    ))
);

export const generateGeminiContent = onCall(
    {
        region: 'us-central1',
        cors: ALLOWED_CORS_ORIGINS,
        secrets: [geminiApiKey],
        timeoutSeconds: 60,
        memory: '512MiB',
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Debes iniciar sesión para usar Gemini.');
        }

        const { contents } = request.data || {};
        if (!isValidContents(contents)) {
            throw new HttpsError('invalid-argument', 'Payload de Gemini inválido.');
        }

        const key = geminiApiKey.value();
        if (!key) {
            throw new HttpsError('failed-precondition', 'Gemini no está configurado en el backend.');
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${key}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents }),
        });

        const body = await response.text();
        let data;
        try {
            data = JSON.parse(body);
        } catch {
            data = null;
        }

        if (!response.ok) {
            const message = data?.error?.message || body || 'Error desconocido de Gemini.';
            const safeMessage = response.status === 400 && message.includes('API key')
                ? 'La clave de Gemini configurada en el backend no es válida.'
                : message;
            throw new HttpsError('internal', `Gemini API Error (${response.status}): ${safeMessage}`);
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            const finishReason = data?.candidates?.[0]?.finishReason;
            if (finishReason === 'SAFETY') {
                throw new HttpsError('failed-precondition', 'La imagen fue bloqueada por filtros de seguridad. Intenta con otra foto.');
            }
            throw new HttpsError('internal', 'Respuesta vacía de Gemini.');
        }

        return { text };
    },
);

export const paypalWebhook = onRequest(
    {
        region: 'us-central1',
        cors: false,
        secrets: [paypalClientId, paypalSecret, paypalWebhookId],
        timeoutSeconds: 60,
    },
    async (req, res) => {
        if (req.method !== 'POST') {
            res.status(405).send('Method not allowed');
            return;
        }

        const event = req.body;
        if (!event?.id || !event?.event_type) {
            res.status(400).send('Invalid PayPal webhook payload');
            return;
        }

        try {
            const isVerified = await verifyPaypalWebhook(req, event);
            if (!isVerified) {
                res.status(400).send('Invalid PayPal webhook signature');
                return;
            }

            const db = getFirestore();
            const eventRef = db.doc(`paypalWebhookEvents/${event.id}`);
            const alreadyProcessed = await db.runTransaction(async (transaction) => {
                const snapshot = await transaction.get(eventRef);
                if (snapshot.exists && snapshot.data()?.processedAt) return true;

                transaction.set(eventRef, {
                    eventType: event.event_type,
                    receivedAt: FieldValue.serverTimestamp(),
                    processingStartedAt: FieldValue.serverTimestamp(),
                }, { merge: true });
                return false;
            });

            if (!alreadyProcessed) {
                await handleSubscriptionWebhook(event);
                await eventRef.set({
                    processedAt: FieldValue.serverTimestamp(),
                }, { merge: true });
            }

            res.status(200).send('OK');
        } catch (error) {
            console.error('PayPal webhook error:', error);
            res.status(500).send('PayPal webhook processing failed');
        }
    },
);

const assertOwnSubscription = async (uid, subscriptionId) => {
    const snapshot = await getFirestore().doc(`users/${uid}`).get();
    const userData = snapshot.data();
    if (!userData?.paypalSubscriptionId || userData.paypalSubscriptionId !== subscriptionId) {
        throw new HttpsError('permission-denied', 'Esta suscripción no pertenece al usuario actual.');
    }
};

export const cancelPayPalSubscription = onCall(
    {
        region: 'us-central1',
        cors: ALLOWED_CORS_ORIGINS,
        secrets: [paypalClientId, paypalSecret],
        timeoutSeconds: 60,
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Debes iniciar sesión para cancelar tu suscripción.');
        }

        const { subscriptionId } = request.data || {};
        await assertOwnSubscription(request.auth.uid, subscriptionId);

        await callPaypal(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/suspend`, {
            method: 'POST',
            body: { reason: 'Cancelado por el usuario desde la app' },
        });

        await getFirestore().doc(`users/${request.auth.uid}`).set({
            cancelAtPeriodEnd: true,
            subscriptionUpdatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        return { ok: true };
    },
);

export const reactivatePayPalSubscription = onCall(
    {
        region: 'us-central1',
        cors: ALLOWED_CORS_ORIGINS,
        secrets: [paypalClientId, paypalSecret],
        timeoutSeconds: 60,
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Debes iniciar sesión para reactivar tu suscripción.');
        }

        const { subscriptionId } = request.data || {};
        await assertOwnSubscription(request.auth.uid, subscriptionId);

        await callPaypal(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/activate`, {
            method: 'POST',
            body: { reason: 'Reactivado por el usuario desde la app' },
        });

        const subscription = await getSubscription(subscriptionId);
        await setUserSubscriptionStatus({
            userId: request.auth.uid,
            subscription,
            updates: {
                isPro: true,
                cancelAtPeriodEnd: false,
            },
        });

        return { ok: true };
    },
);
