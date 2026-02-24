import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const slides = [
    {
        image: '/piggy-bank.png',
        title: '¡Bienvenido a tu',
        titleHighlight: 'libertad financiera!',
        description: 'Toma el control de tus finanzas en RD$ y alcanza tus metas más rápido.'
    },
    {
        icon: 'pie_chart',
        title: 'Presupuestos',
        titleHighlight: 'inteligentes',
        description: 'Organiza tus gastos con la regla 50/30/20 y nunca pierdas el control.'
    },
    {
        icon: 'savings',
        title: 'Metas de',
        titleHighlight: 'ahorro reales',
        description: 'Crea tu fondo de emergencia y ahorra para lo que realmente importa.'
    }
];

export default function Onboarding() {
    const navigate = useNavigate();
    const { login, signup, currentUser } = useAuth();
    const [currentSlide, setCurrentSlide] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showOnboarding, setShowOnboarding] = useState(true);

    // Auth form state
    const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        const hasSeen = localStorage.getItem('hasSeenOnboarding');
        if (hasSeen === 'true') {
            setShowOnboarding(false);
        }
    }, []);

    if (currentUser) {
        return <Navigate to="/" />;
    }

    const markOnboardingSeen = () => {
        localStorage.setItem('hasSeenOnboarding', 'true');
        setShowOnboarding(false);
    };

    const handleNext = () => {
        if (currentSlide < slides.length - 1) {
            setCurrentSlide(currentSlide + 1);
        } else {
            markOnboardingSeen();
        }
    };

    const handleSkip = () => {
        markOnboardingSeen();
    };

    const handleEmailAuth = async (e) => {
        e.preventDefault();
        if (!email.trim() || !password.trim()) return;
        if (authMode === 'register' && !name.trim()) return;

        try {
            setError('');
            setLoading(true);
            if (authMode === 'register') {
                await signup(email.trim(), password, name.trim());
            } else {
                await login(email.trim(), password);
            }
            navigate('/');
        } catch (err) {
            const code = err.code || '';
            if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') setError('Correo o contraseña incorrectos.');
            else if (code === 'auth/email-already-in-use') setError('Este correo ya está registrado.');
            else if (code === 'auth/weak-password') setError('La contraseña debe tener al menos 6 caracteres.');
            else if (code === 'auth/invalid-email') setError('El correo electrónico no es válido.');
            else setError(err.message || 'Error de autenticación.');
        } finally {
            setLoading(false);
        }
    };


    // ─── Auth Screen (after onboarding slides) ───
    if (!showOnboarding) {
        return (
            <div className="flex flex-col min-h-screen bg-[#f7f9f8] items-center justify-center px-6 relative">
                {/* Decorative background */}
                <div className="absolute top-0 left-0 w-full h-72 bg-gradient-to-br from-primary/20 to-emerald-100 rounded-b-[40%] -z-0" />
                <div className="absolute top-20 right-10 w-20 h-20 bg-primary/20 rounded-full blur-2xl -z-0" />
                <div className="absolute bottom-20 left-10 w-32 h-32 bg-primary/15 rounded-full blur-3xl -z-0" />

                {/* Logo */}
                <div className="w-24 h-24 rounded-[1.5rem] overflow-hidden shadow-xl mb-6 bg-white flex items-center justify-center relative z-10 border-4 border-white">
                    <img src="/piggy-bank.png" alt="Logo" className="w-20 h-20 object-contain" />
                </div>

                <div className="relative z-10 text-center mb-6">
                    <h1 className="text-3xl font-extrabold text-gray-900 leading-tight mb-1">
                        <span className="text-primary">Freenanzas</span>
                    </h1>
                    <p className="text-gray-400 text-sm font-medium">Tu planificador financiero personal</p>
                </div>

                {/* Auth Card */}
                <div className="relative z-10 w-full max-w-sm bg-white rounded-[28px] shadow-[0_8px_40px_rgba(0,0,0,0.06)] p-6 space-y-5">
                    {/* Tabs */}
                    <div className="flex bg-gray-100 rounded-2xl p-1">
                        <button
                            onClick={() => { setAuthMode('login'); setError(''); }}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${authMode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
                        >
                            Iniciar Sesión
                        </button>
                        <button
                            onClick={() => { setAuthMode('register'); setError(''); }}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${authMode === 'register' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
                        >
                            Registrarse
                        </button>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl border border-red-100 flex items-center gap-2 text-sm font-medium">
                            <span className="material-symbols-rounded text-lg">error</span>
                            {error}
                        </div>
                    )}

                    {/* Email/Password Form */}
                    <form onSubmit={handleEmailAuth} className="space-y-3">
                        {authMode === 'register' && (
                            <div className="relative">
                                <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 text-xl">person</span>
                                <input
                                    type="text" value={name} onChange={e => setName(e.target.value)}
                                    placeholder="Nombre completo" required
                                    className="w-full bg-gray-50 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/30 border-none"
                                />
                            </div>
                        )}
                        <div className="relative">
                            <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 text-xl">mail</span>
                            <input
                                type="email" value={email} onChange={e => setEmail(e.target.value)}
                                placeholder="Correo electrónico" required
                                className="w-full bg-gray-50 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/30 border-none"
                            />
                        </div>
                        <div className="relative">
                            <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 text-xl">lock</span>
                            <input
                                type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                                placeholder="Contraseña" required minLength={6}
                                className="w-full bg-gray-50 rounded-2xl pl-12 pr-12 py-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/30 border-none"
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                                <span className="material-symbols-rounded text-xl">{showPassword ? 'visibility_off' : 'visibility'}</span>
                            </button>
                        </div>
                        <button
                            type="submit" disabled={loading}
                            className="w-full bg-gradient-to-r from-primary to-emerald-500 text-black font-bold py-4 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 text-base shadow-lg shadow-primary/20"
                        >
                            {loading ? (
                                <span className="material-symbols-rounded animate-spin">progress_activity</span>
                            ) : authMode === 'register' ? (
                                <><span className="material-symbols-rounded">person_add</span> Crear Cuenta</>
                            ) : (
                                <><span className="material-symbols-rounded">login</span> Entrar</>
                            )}
                        </button>
                    </form>

                </div>

                {/* Replay onboarding */}
                <button
                    onClick={() => { localStorage.removeItem('hasSeenOnboarding'); setShowOnboarding(true); }}
                    className="relative z-10 mt-4 text-[13px] font-semibold text-gray-400 hover:text-gray-600 transition-colors"
                >
                    Ver introducción de nuevo
                </button>
            </div>
        );
    }

    // ─── Onboarding Slides ───
    const slide = slides[currentSlide];
    const isLastSlide = currentSlide === slides.length - 1;

    return (
        <div className="flex flex-col min-h-screen bg-[#f7f9f8]">
            {/* Top bar */}
            <div className="flex items-center justify-between px-6 pt-6">
                <div className="flex items-center gap-2">
                    {slides.map((_, i) => (
                        <div
                            key={i}
                            className={`h-2 rounded-full transition-all duration-300 ${i === currentSlide ? 'w-6 bg-primary' : 'w-2 bg-gray-300'}`}
                        />
                    ))}
                </div>
                <button onClick={handleSkip} className="text-sm text-gray-500 font-medium hover:text-gray-700 transition-colors">
                    Omitir
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col items-center justify-center px-8">
                {slide.image ? (
                    <div className="w-72 h-72 rounded-3xl overflow-hidden shadow-lg mb-10">
                        <img src={slide.image} alt="Onboarding" className="w-full h-full object-cover" />
                    </div>
                ) : (
                    <div className="w-40 h-40 rounded-full bg-primary/10 flex items-center justify-center mb-10">
                        <span className="material-symbols-rounded text-primary" style={{ fontSize: '72px' }}>{slide.icon}</span>
                    </div>
                )}

                <h1 className="text-3xl font-bold text-center leading-tight mb-4">
                    {slide.title}<br />
                    <span className="text-primary">{slide.titleHighlight}</span>
                </h1>
                <p className="text-gray-500 text-center text-base leading-relaxed max-w-xs">
                    {slide.description}
                </p>
            </div>

            {/* Bottom */}
            <div className="px-8 pb-8 space-y-4">
                <button
                    onClick={handleNext}
                    className="w-full bg-primary hover:bg-primary-dark text-black font-semibold py-4 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-lg shadow-lg shadow-primary/20"
                >
                    {isLastSlide ? 'Comenzar' : <>Continuar <span className="material-symbols-rounded">arrow_forward</span></>}
                </button>
                <p className="text-center text-sm text-gray-400">Paso {currentSlide + 1} de {slides.length}</p>
            </div>
        </div>
    );
}
