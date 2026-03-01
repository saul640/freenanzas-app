import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, Timestamp } from "firebase/firestore";
import * as dotenv from "dotenv";

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkUserTrial() {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("email", "==", "qa.test.finanzas@yopmail.com"));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    console.log("Error: Usuario no encontrado.");
    process.exit(1);
  }

  const docSnap = querySnapshot.docs[0];
  const userRef = doc(db, 'users', docSnap.id);

  // Set date 1 day in the past
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 2);

  await updateDoc(userRef, { trialEndsAt: Timestamp.fromDate(pastDate) });
  console.log('SUCCESS: trialEndsAt is now in the past.');
  process.exit(0);
}

checkUserTrial().catch(console.error);
