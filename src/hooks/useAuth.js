import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext.js';

export function useAuth() {
  return useContext(AuthContext);
}
