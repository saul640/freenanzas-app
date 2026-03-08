import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { applyActionCode } from 'firebase/auth';
import { auth } from '../firebase';
import { toast, Toaster } from 'react-hot-toast';

export default function AuthAction() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
    const [message, setMessage] = useState('');

    useEffect(() => {
        const mode = searchParams.get('mode');
        const actionCode = searchParams.get('oobCode');

        if (!mode || !actionCode) {
            setStatus('error');
            setMessage('Enlace no válido. Faltan parámetros.');
            return;
        }

        if (mode === 'verifyEmail') {
            handleVerifyEmail(actionCode);
        } else if (mode === 'resetPassword') {
            setStatus('error');
            setMessage('El restablecimiento de contraseña no está soportado en esta página aún.');
        } else {
            setStatus('error');
            setMessage('Acción no reconocida.');
        }
    }, [searchParams]);

    const handleVerifyEmail = async (actionCode) => {
        try {
            await applyActionCode(auth, actionCode);
            setStatus('success');
            setMessage('¡Tu cuenta ha sido verificada correctamente!');
            toast.success('¡Cuenta verificada!');
        } catch (error) {
            console.error('Error verifying email:', error);
            setStatus('error');
            switch (error.code) {
                case 'auth/expired-action-code':
                    setMessage('El enlace ha expirado. Por favor solicita uno nuevo en tu perfil.');
                    break;
                case 'auth/invalid-action-code':
                    setMessage('El enlace es inválido o ya fue utilizado.');
                    break;
                case 'auth/user-disabled':
                    setMessage('Esta cuenta de usuario ha sido deshabilitada.');
                    break;
                case 'auth/user-not-found':
                    setMessage('No se encontró el usuario asociado a este enlace.');
                    break;
                default:
                    setMessage('Hubo un error al verificar tu correo. Inténtalo de nuevo.');
            }
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#f7f9f8] dark:bg-slate-900 items-center justify-center px-6 relative transition-colors duration-200">
            <Toaster position="top-center" />

            {/* Decorative background */}
            <div className="absolute top-0 left-0 w-full h-72 bg-gradient-to-br from-primary/20 to-emerald-100 dark:from-primary/10 dark:to-emerald-900/20 rounded-b-[40%] -z-0" />

            <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-800 rounded-[28px] shadow-[0_8px_40px_rgba(0,0,0,0.06)] dark:shadow-none border border-gray-100 dark:border-slate-700 p-8 text-center space-y-6">
                {status === 'loading' && (
                    <>
                        <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                            <span className="material-symbols-rounded text-4xl animate-spin">progress_activity</span>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Verificando...</h2>
                        <p className="text-gray-500 dark:text-gray-400">Por favor, espera un momento mientras validamos tu enlace.</p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div className="w-20 h-20 bg-green-50 dark:bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4 scale-in-center">
                            <span className="material-symbols-rounded text-5xl">check_circle</span>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">¡Éxito!</h2>
                        <p className="text-gray-500 dark:text-gray-400">{message}</p>
                        <button
                            onClick={() => navigate('/')}
                            className="w-full mt-6 bg-gradient-to-r from-primary to-emerald-500 hover:from-primary-dark hover:to-emerald-600 text-black font-bold py-3.5 rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-primary/20"
                        >
                            Ir al Panel Principal
                        </button>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div className="w-20 h-20 bg-red-50 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="material-symbols-rounded text-5xl">error</span>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Error de Verificación</h2>
                        <p className="text-gray-500 dark:text-gray-400">{message}</p>
                        <button
                            onClick={() => navigate('/onboarding')}
                            className="w-full mt-6 bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-200 font-bold py-3.5 rounded-2xl transition-all active:scale-[0.98] hover:bg-gray-200 dark:hover:bg-slate-600"
                        >
                            Volver al Inicio
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
