import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { auth } from './firebase'

export const signUpWithEmail = (email, password) =>
  createUserWithEmailAndPassword(auth, email, password)

export const signInWithEmail = (email, password) =>
  signInWithEmailAndPassword(auth, email, password)

export const signOutUser = () => signOut(auth)
