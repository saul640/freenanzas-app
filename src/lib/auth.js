import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { auth } from './firebase'

const googleProvider = new GoogleAuthProvider()

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider)

export const signUpWithEmail = (email, password) =>
  createUserWithEmailAndPassword(auth, email, password)

export const signInWithEmail = (email, password) =>
  signInWithEmailAndPassword(auth, email, password)

export const signOutUser = () => signOut(auth)
