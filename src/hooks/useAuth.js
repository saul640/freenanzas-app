import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { ensureUserProfile } from '../lib/firestore'

export const useAuth = () => {
  const [user, setUser] = useState(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      setInitializing(false)

      if (firebaseUser) {
        try {
          await ensureUserProfile(firebaseUser)
        } catch (error) {
          console.error('Error asegurando perfil de usuario', error)
        }
      }
    })

    return () => unsubscribe()
  }, [])

  return { user, initializing }
}
