import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'dotenv';

const rootDir = process.cwd();
const envFile = process.argv[2] || '.env.production';
const envPath = path.resolve(rootDir, envFile);

const loadEnv = () => {
    const values = {};
    if (fs.existsSync(envPath)) {
        Object.assign(values, parse(fs.readFileSync(envPath, 'utf8')));
    }
    return { ...values, ...process.env };
};

const env = loadEnv();
const failures = [];
const warnings = [];

const getEnv = (...names) => {
    for (const name of names) {
        const value = env[name];
        if (typeof value === 'string' && value.trim()) {
            return { name, value: value.trim() };
        }
    }
    return { name: names[0], value: '' };
};

const isPlaceholder = (value) => (
    !value || /TODO|TEST|SANDBOX|AQUI|YOUR_|PLAN_ID|CLIENT_ID|CHANGE_ME|REPLACE/i.test(value)
);

const requireValue = (label, names, validator) => {
    const found = getEnv(...names);
    if (isPlaceholder(found.value)) {
        failures.push(`${label}: falta valor real (${names.join(' o ')}).`);
        return null;
    }
    if (validator && !validator(found.value)) {
        failures.push(`${label}: formato inesperado en ${found.name}.`);
        return null;
    }
    return found;
};

const requireSourceText = (file, snippets) => {
    const filePath = path.resolve(rootDir, file);
    if (!fs.existsSync(filePath)) {
        failures.push(`${file}: archivo no encontrado.`);
        return;
    }
    const text = fs.readFileSync(filePath, 'utf8');
    for (const snippet of snippets) {
        if (!text.includes(snippet)) {
            failures.push(`${file}: no contiene "${snippet}".`);
        }
    }
};

if ((env.PAYPAL_ENV || '').trim() !== 'live') {
    failures.push('PAYPAL_ENV debe ser "live" para cobrar al público.');
}

requireValue('PayPal Client ID frontend', ['VITE_PAYPAL_CLIENT_ID'], (value) => value.length >= 40);
requireValue('Plan mensual PayPal', ['VITE_PAYPAL_PLAN_ID_MONTHLY', 'VITE_PAYPAL_PLAN_MONTHLY'], (value) => /^P-[A-Z0-9]+$/i.test(value));
requireValue('Plan anual PayPal', ['VITE_PAYPAL_PLAN_ID_ANNUAL', 'VITE_PAYPAL_PLAN_ANNUAL'], (value) => /^P-[A-Z0-9]+$/i.test(value));
requireValue('Fallback mensual PayPal', ['VITE_PAYPAL_FALLBACK_MONTHLY'], (value) => /^https:\/\/(www\.)?paypal\.com\//i.test(value));
requireValue('Fallback anual PayPal', ['VITE_PAYPAL_FALLBACK_ANNUAL'], (value) => /^https:\/\/(www\.)?paypal\.com\//i.test(value));

const monthly = getEnv('VITE_PAYPAL_PLAN_ID_MONTHLY', 'VITE_PAYPAL_PLAN_MONTHLY');
const annual = getEnv('VITE_PAYPAL_PLAN_ID_ANNUAL', 'VITE_PAYPAL_PLAN_ANNUAL');
if (monthly.value && annual.value && monthly.value === annual.value) {
    failures.push('Los planes mensual y anual no pueden usar el mismo PayPal plan ID.');
}

const legacyMonthly = getEnv('VITE_PAYPAL_PLAN_MONTHLY');
const legacyAnnual = getEnv('VITE_PAYPAL_PLAN_ANNUAL');
if (legacyMonthly.value && !env.VITE_PAYPAL_PLAN_ID_MONTHLY) {
    warnings.push('Usando alias legacy VITE_PAYPAL_PLAN_MONTHLY; preferir VITE_PAYPAL_PLAN_ID_MONTHLY.');
}
if (legacyAnnual.value && !env.VITE_PAYPAL_PLAN_ID_ANNUAL) {
    warnings.push('Usando alias legacy VITE_PAYPAL_PLAN_ANNUAL; preferir VITE_PAYPAL_PLAN_ID_ANNUAL.');
}

requireSourceText('src/components/PaywallModal.jsx', [
    'custom_id: `${currentUser.uid}|${billingCycle}`',
    '$4.99',
    '$47.90',
    '/refunds-cancellation',
]);

requireSourceText('src/components/SubscriptionCard.jsx', [
    '$4.99 USD / mes',
    '$47.90 USD / año',
    'Últimos comprobantes PayPal',
    'Referencia de comprobante copiada.',
]);

requireSourceText('functions/index.js', [
    "process.env.PAYPAL_ENV === 'sandbox'",
    'verify-webhook-signature',
    'assertActiveSubscription(subscription);',
    'billingReceipts',
]);

for (const warning of warnings) {
    console.warn(`WARN: ${warning}`);
}

if (failures.length > 0) {
    console.error('PayPal production verification failed:');
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exit(1);
}

console.log(`PayPal production config looks ready (${envFile}). Values were not printed.`);
