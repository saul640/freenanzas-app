import { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { generateDailyInsight } from '../lib/gemini';

export function useDailyInsight(userData, currentUser) {
    const [insight, setInsight] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const loadInsight = async () => {
            if (!currentUser || !userData) {
                if (isMounted) setLoading(false);
                return;
            }

            const today = new Date().toLocaleDateString('en-CA'); // format: YYYY-MM-DD local time
            const dailyData = userData.dailyInsight || {};

            // If we already have an insight for today, use it directly
            if (dailyData.lastUpdated === today && dailyData.currentText) {
                if (isMounted) {
                    setInsight(dailyData.currentText);
                    setLoading(false);
                }
                return;
            }

            try {
                if (isMounted) setLoading(true);

                // Generate new insight using history completely avoiding repeats
                const history = dailyData.history || [];
                const newInsight = await generateDailyInsight(history);

                // Update history, keeping only the last 30 to prevent document bloat
                const updatedHistory = [...history, newInsight].slice(-30);

                const newDailyInsight = {
                    lastUpdated: today,
                    currentText: newInsight,
                    history: updatedHistory
                };

                // Save additively to Firestore using updateDoc
                const userRef = doc(db, 'users', currentUser.uid);
                await updateDoc(userRef, {
                    dailyInsight: newDailyInsight
                });

                if (isMounted) {
                    setInsight(newInsight);
                    setLoading(false);
                }
            } catch (error) {
                console.error("Error loading daily insight:", error);
                if (isMounted) {
                    // Fallback visually if something completely breaks (e.g. firestore write fails)
                    setInsight("Un presupuesto es decir a tu dinero a dónde ir en lugar de preguntarte a dónde fue.");
                    setLoading(false);
                }
            }
        };

        loadInsight();

        return () => {
            isMounted = false;
        };
    }, [userData, currentUser]);

    return { insight, loading };
}
