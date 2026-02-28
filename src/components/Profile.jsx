import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import BottomNav from './BottomNav';
import { doc, updateDoc } from 'firebase/firestore';
import { db, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast, Toaster } from 'react-hot-toast';
import PaywallModal from './PaywallModal';

export default function Profile() {
    const navigate = useNavigate();
    const {
        currentUser,
        userData,
        isProUser: isPro,
        isTrialUser,
        logout,
        updateProfile,
        sendEmailVerification,
        updatePassword,
        EmailAuthProvider,
        reauthenticateWithCredential
    } = useAuth();

    const [loading, setLoading] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState(currentUser?.displayName || userData?.name || '');

    // Security states
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [isSecurityOpen, setIsSecurityOpen] = useState(false);

    const fileInputRef = useRef(null);
    const [showPaywall, setShowPaywall] = useState(false);

    const userName = currentUser?.displayName || userData?.name || 'Usuario de Freenanzas';
    const userEmail = currentUser?.email || '';
    const userPhoto = currentUser?.photoURL || null;
    const isVerified = currentUser?.emailVerified || false;

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/onboarding');
        } catch (e) {
            console.error('Error al cerrar sesión', e);
            toast.error("Error al cerrar sesión.");
        }
    };

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Basic validation
        if (!file.type.startsWith('image/')) {
            toast.error("Por favor, selecciona una imagen válida.");
            return;
        }

        const toastId = toast.loading("Subiendo foto de perfil...");
        setLoading(true);

        try {
            const fileExtension = file.name.split('.').pop();
            const storageRef = ref(storage, `avatars/${currentUser.uid}.${fileExtension}`);

            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            // Update Auth
            if (updateProfile) {
                await updateProfile(currentUser, { photoURL: downloadURL });
            }

            // Update Firestore additively
            const userRef = doc(db, 'users', currentUser.uid);
            await updateDoc(userRef, { photoURL: downloadURL });

            toast.success("Foto de perfil actualizada", { id: toastId });
        } catch (error) {
            console.error("Error uploading avatar:", error);
            toast.error("Hubo un error al subir la foto.", { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    const handleSaveName = async () => {
        if (!newName.trim()) {
            setIsEditingName(false);
            return;
        }

        const toastId = toast.loading("Actualizando nombre...");
        setLoading(true);

        try {
            // Update Auth
            if (updateProfile) {
                await updateProfile(currentUser, { displayName: newName.trim() });
            }

            // Update Firestore additively
            const userRef = doc(db, 'users', currentUser.uid);
            await updateDoc(userRef, { name: newName.trim() });

            setIsEditingName(false);
            toast.success("Nombre actualizado", { id: toastId });
        } catch (error) {
            console.error("Error updating name:", error);
            toast.error("Hubo un error al actualizar el nombre.", { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyEmail = async () => {
        const toastId = toast.loading("Enviando correo de verificación...");
        setLoading(true);
        try {
            if (sendEmailVerification) {
                await sendEmailVerification(currentUser);
                toast.success("Correo enviado. Revisa tu bandeja de entrada o spam.", { id: toastId, duration: 5000 });
            } else {
                toast.error("Error de dependencia al verificar.", { id: toastId });
            }
        } catch (error) {
            console.error("Email verification error:", error);
            if (error.code === 'auth/too-many-requests') {
                toast.error("Demasiados intentos. Espera unos minutos.", { id: toastId });
            } else {
                toast.error("Error al enviar el correo.", { id: toastId });
            }
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();

        if (!currentPassword || !newPassword) {
            toast.error("Completa ambos campos de contraseña.");
            return;
        }

        if (newPassword.length < 6) {
            toast.error("La nueva contraseña debe tener al menos 6 caracteres.");
            return;
        }

        const toastId = toast.loading("Cambiando contraseña...");
        setLoading(true);

        try {
            if (!reauthenticateWithCredential || !updatePassword || !EmailAuthProvider) {
                toast.error("Error de configuración externa.", { id: toastId });
                return;
            }

            // 1. Reauthenticate
            const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
            await reauthenticateWithCredential(currentUser, credential);

            // 2. Update password
            await updatePassword(currentUser, newPassword);

            toast.success("Contraseña actualizada exitosamente.", { id: toastId });
            setCurrentPassword('');
            setNewPassword('');
            setIsSecurityOpen(false);
        } catch (error) {
            console.error("Password update error:", error);
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
                toast.error("La contraseña actual es incorrecta.", { id: toastId });
            } else {
                toast.error("Error al cambiar la contraseña.", { id: toastId });
            }
        } finally {
            setLoading(false);
        }
    };

    // isPro ya viene del contexto centralizado (isProUser)

    return (
        <div className="flex flex-col min-h-screen bg-[#f7f9f8] max-w-md mx-auto relative shadow-2xl overflow-hidden pb-32">
            <Toaster position="top-center" />

            <header className="bg-primary text-black px-6 pt-12 pb-6 rounded-b-[2rem] shadow-sm relative z-10">
                <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
            </header>

            <div className="flex-1 mt-6 px-6 relative z-10 flex flex-col items-center">
                {/* Avatar Section */}
                <div className="relative mb-4">
                    <div
                        className={`w-28 h-28 rounded-full bg-white shadow-md border-4 border-white flex items-center justify-center overflow-hidden ${loading ? 'opacity-50' : ''}`}
                    >
                        {userPhoto ? (
                            <img src={userPhoto} alt="Foto de perfil" className="w-full h-full object-cover" />
                        ) : (
                            <span className="material-symbols-rounded text-6xl text-gray-300">person</span>
                        )}
                    </div>
                    <button
                        onClick={handleAvatarClick}
                        disabled={loading}
                        className="absolute bottom-0 right-0 bg-primary text-black w-10 h-10 rounded-full shadow-lg flex items-center justify-center hover:bg-yellow-400 transition-colors border-2 border-white"
                        aria-label="Cambiar foto de perfil"
                    >
                        <span className="material-symbols-rounded text-[20px]">photo_camera</span>
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        className="hidden"
                    />
                </div>

                {/* Name / Basic Info */}
                <div className="flex flex-col items-center w-full mb-8">
                    {isEditingName ? (
                        <div className="flex items-center gap-2 w-full max-w-xs mb-2">
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-center font-bold"
                                disabled={loading}
                            />
                            <button
                                onClick={handleSaveName}
                                disabled={loading}
                                className="bg-green-500 text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
                            >
                                <span className="material-symbols-rounded">check</span>
                            </button>
                            <button
                                onClick={() => { setIsEditingName(false); setNewName(userName); }}
                                disabled={loading}
                                className="bg-gray-200 text-gray-700 w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
                            >
                                <span className="material-symbols-rounded">close</span>
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-2xl font-bold text-gray-800">{userName}</h2>
                            <button
                                onClick={() => setIsEditingName(true)}
                                className="text-gray-400 hover:text-primary transition-colors"
                            >
                                <span className="material-symbols-rounded text-[18px]">edit</span>
                            </button>
                        </div>
                    )}

                    <p className="text-sm text-gray-500 mb-3">{userEmail}</p>

                    {isPro && !isTrialUser && (
                        <div className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-400 to-amber-500 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-sm">
                            <span className="material-symbols-rounded text-[14px]">crown</span>
                            USUARIO PRO
                        </div>
                    )}

                    {isTrialUser && userData?.trialEndsAt && (
                        <div className="flex items-center gap-1.5 bg-gradient-to-r from-blue-400 to-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-sm">
                            <span className="material-symbols-rounded text-[14px]">hourglass_top</span>
                            PRUEBA GRATUITA
                        </div>
                    )}

                    {!isPro && (
                        <button
                            onClick={() => setShowPaywall(true)}
                            className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-400 to-amber-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-sm active:scale-95 transition-transform mt-2"
                        >
                            <span className="material-symbols-rounded text-[14px]">crown</span>
                            Hazte PRO
                        </button>
                    )}
                </div>

                {/* Settings Cards */}
                <div className="w-full space-y-4">

                    {/* Account Verification Card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center">
                                    <span className="material-symbols-rounded text-[20px]">verified_user</span>
                                </div>
                                <h3 className="font-semibold text-gray-800">Estado de la cuenta</h3>
                            </div>
                            {isVerified ? (
                                <span className="flex items-center text-xs font-bold text-green-500 bg-green-50 px-2 py-1 rounded-full">
                                    <span className="material-symbols-rounded text-[14px] mr-1">check_circle</span>
                                    Verificada
                                </span>
                            ) : (
                                <span className="flex items-center text-xs font-bold text-orange-500 bg-orange-50 px-2 py-1 rounded-full">
                                    <span className="material-symbols-rounded text-[14px] mr-1">pending</span>
                                    Pendiente
                                </span>
                            )}
                        </div>

                        {!isVerified && (
                            <div className="mt-3">
                                <p className="text-xs text-gray-500 mb-3">Tu cuenta no está verificada. Verifica tu correo para asegurar tu acceso.</p>
                                <button
                                    onClick={handleVerifyEmail}
                                    disabled={loading}
                                    className="w-full py-2 bg-blue-50 text-blue-600 font-medium rounded-xl text-sm hover:bg-blue-100 transition-colors disabled:opacity-50"
                                >
                                    Enviar correo de verificación
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Security Card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <button
                            onClick={() => setIsSecurityOpen(!isSecurityOpen)}
                            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-gray-50 text-gray-600 flex items-center justify-center">
                                    <span className="material-symbols-rounded text-[20px]">lock</span>
                                </div>
                                <h3 className="font-semibold text-gray-800">Seguridad</h3>
                            </div>
                            <span className={`material-symbols-rounded text-gray-400 transition-transform ${isSecurityOpen ? 'rotate-180' : ''}`}>
                                expand_more
                            </span>
                        </button>

                        {isSecurityOpen && (
                            <div className="px-4 pb-4 pt-1 border-t border-gray-50 animate-fade-in">
                                <p className="text-xs text-gray-500 mb-4">Actualiza tu contraseña. Por seguridad, te pediremos la contraseña actual.</p>
                                <form onSubmit={handlePasswordChange} className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña Actual</label>
                                        <input
                                            type="password"
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                            placeholder="••••••••"
                                            disabled={loading}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Nueva Contraseña</label>
                                        <input
                                            type="password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                            placeholder="••••••••"
                                            disabled={loading}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={loading || !currentPassword || !newPassword}
                                        className="w-full py-2 bg-gray-900 text-white font-medium rounded-xl text-sm hover:bg-black transition-colors disabled:opacity-50 mt-2"
                                    >
                                        Cambiar Contraseña
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>

                    {/* Logout Card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-6">
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center justify-between p-4 text-left hover:bg-red-50 transition-colors cursor-pointer"
                        >
                            <div className="flex items-center gap-3 text-red-500 font-medium">
                                <span className="material-symbols-rounded">logout</span>
                                Cerrar Sesión
                            </div>
                            <span className="material-symbols-rounded text-gray-300">chevron_right</span>
                        </button>
                    </div>

                </div>
            </div>

            <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} />
            <BottomNav />
        </div>
    );
}
