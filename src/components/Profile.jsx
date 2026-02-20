import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import BottomNav from './BottomNav';

export default function Profile() {
    const navigate = useNavigate();
    const { currentUser, logout } = useAuth();

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/onboarding');
        } catch (e) {
            console.error('Error al cerrar sesión', e);
        }
    };

    const userName = currentUser?.displayName || 'Usuario de Freenanzas';
    const userEmail = currentUser?.email || '';
    const userPhoto = currentUser?.photoURL || null;

    return (
        <div className="flex flex-col min-h-screen bg-[#f7f9f8] max-w-md mx-auto relative shadow-2xl overflow-hidden pb-32">
            <header className="bg-primary text-black px-6 pt-12 pb-6 rounded-b-[2rem] shadow-sm relative z-10">
                <h1 className="text-2xl font-bold tracking-tight">Mi Perfil</h1>
            </header>

            <div className="flex-1 mt-6 px-6 relative z-10 flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-white shadow-md border-4 border-white flex items-center justify-center overflow-hidden mb-4">
                    {userPhoto ? (
                        <img src={userPhoto} alt="Foto de perfil" className="w-full h-full object-cover" />
                    ) : (
                        <span className="material-symbols-rounded text-5xl text-gray-300">person</span>
                    )}
                </div>

                <h2 className="text-xl font-bold text-gray-800">{userName}</h2>
                <p className="text-sm text-gray-500 mb-8">{userEmail}</p>

                <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                        <div className="flex items-center gap-3 text-red-500 font-medium">
                            <span className="material-symbols-rounded">logout</span>
                            Cerrar Sesión
                        </div>
                        <span className="material-symbols-rounded text-gray-300">chevron_right</span>
                    </button>
                    {/* Add other settings here later if needed */}
                </div>
            </div>

            <BottomNav />
        </div>
    );
}
