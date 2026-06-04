import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'node:fs';

const email = process.argv[2] || 'saul640@gmail.com';
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

const readDotenvProjectId = () => {
    const candidates = ['.env.local', '../.env.local'];
    for (const path of candidates) {
        if (!existsSync(path)) continue;

        const match = readFileSync(path, 'utf8').match(/^VITE_FIREBASE_PROJECT_ID=(.+)$/m);
        if (match) return match[1].trim().replace(/^["']|["']$/g, '');
    }
    return undefined;
};

const appOptions = serviceAccountPath
    ? { credential: cert(JSON.parse(readFileSync(serviceAccountPath, 'utf8'))) }
    : {
        credential: applicationDefault(),
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || readDotenvProjectId(),
    };

initializeApp(appOptions);

const user = await getAuth().getUserByEmail(email);
const db = getFirestore();

await db.doc(`users/${user.uid}`).set({
    uid: user.uid,
    email: user.email || email,
    isAdmin: true,
    role: 'admin',
    roles: {
        admin: true,
    },
    adminProOverride: {
        active: true,
        grantedAt: FieldValue.serverTimestamp(),
        grantedBy: 'server-script',
        reason: 'Admin privileges granted by owner request',
    },
    updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });

console.log(`Admin privileges granted to ${email} (${user.uid}).`);
