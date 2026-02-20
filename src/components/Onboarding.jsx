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
    const { loginWithGoogle, currentUser } = useAuth();
    const [currentSlide, setCurrentSlide] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showOnboarding, setShowOnboarding] = useState(true);

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

    const handleGoogleLogin = async () => {
        try {
            setError('');
            setLoading(true);
            await loginWithGoogle();
            navigate('/');
        } catch (err) {
            console.error(err);
            setError('Error al iniciar sesión. Verifica tu configuración de Firebase.');
        } finally {
            setLoading(false);
        }
    };

    if (!showOnboarding) {
        return (
            <div className="flex flex-col min-h-screen bg-[#f7f9f8] items-center justify-center px-8 relative">
                {/* Decorative background elements */}
                <div className="absolute top-0 left-0 w-full h-64 bg-primary/10 rounded-b-[40%] -z-0"></div>
                <div className="absolute top-20 right-10 w-20 h-20 bg-primary/20 rounded-full blur-2xl -z-0"></div>
                <div className="absolute bottom-20 left-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl -z-0"></div>

                <div className="w-32 h-32 rounded-[2rem] overflow-hidden shadow-2xl mb-8 bg-white flex items-center justify-center relative z-10 border-4 border-white">
                    <img src="/piggy-bank.png" alt="Logo" className="w-24 h-24 object-contain" />
                </div>

                <div className="relative z-10 text-center mb-12">
                    <h1 className="text-4xl font-extrabold text-gray-900 leading-tight mb-3">
                        Bienvenido a<br />
                        <span className="text-primary tracking-tight">Freenanzas</span>
                    </h1>
                    <p className="text-gray-500 text-[15px] font-medium max-w-[260px] mx-auto">
                        Tu libertad financiera,<br />a un solo clic de distancia.
                    </p>
                </div>

                {error && (
                    <div className="relative z-10 w-full max-w-sm mb-6 bg-red-50 text-red-600 px-4 py-3 rounded-xl border border-red-100 flex items-center gap-3">
                        <span className="material-symbols-rounded">error</span>
                        <p className="text-sm font-medium">{error}</p>
                    </div>
                )}

                <div className="relative z-10 w-full max-w-sm space-y-4">
                    <button
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className="w-full bg-white text-gray-800 font-bold py-4 px-6 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-gray-100 cursor-pointer"
                    >
                        {loading ? (
                            <span className="material-symbols-rounded animate-spin text-primary">progress_activity</span>
                        ) : (
                            <>
                                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
                                <span className="text-base tracking-wide">Continuar con Google</span>
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => {
                            localStorage.removeItem('hasSeenOnboarding');
                            setShowOnboarding(true);
                        }}
                        className="w-full text-center py-3 text-[13px] font-semibold text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    >
                        Ver introducción de nuevo
                    </button>
                </div>
            </div>
        );
    }

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
                            className={`h-2 rounded-full transition-all duration-300 ${i === currentSlide ? 'w-6 bg-primary' : 'w-2 bg-gray-300'
                                }`}
                        />
                    ))}
                </div>
                <button
                    onClick={handleSkip}
                    className="text-sm text-gray-500 font-medium hover:text-gray-700 transition-colors"
                >
                    Omitir
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col items-center justify-center px-8">
                {/* Image or Icon */}
                {slide.image ? (
                    <div className="w-72 h-72 rounded-3xl overflow-hidden shadow-lg mb-10">
                        <img src={slide.image} alt="Onboarding" className="w-full h-full object-cover" />
                    </div>
                ) : (
                    <div className="w-40 h-40 rounded-full bg-primary/10 flex items-center justify-center mb-10">
                        <span className="material-symbols-rounded text-primary" style={{ fontSize: '72px' }}>{slide.icon}</span>
                    </div>
                )}

                {/* Text */}
                <h1 className="text-3xl font-bold text-center leading-tight mb-4">
                    {slide.title}<br />
                    <span className="text-primary">{slide.titleHighlight}</span>
                </h1>
                <p className="text-gray-500 text-center text-base leading-relaxed max-w-xs">
                    {slide.description}
                </p>

                {error && (
                    <p className="text-red-500 text-sm mt-4 text-center bg-red-50 px-4 py-2 rounded-lg">{error}</p>
                )}
            </div>

            {/* Bottom */}
            <div className="px-8 pb-8 space-y-4">
                <button
                    onClick={handleNext}
                    disabled={loading}
                    className="w-full bg-primary hover:bg-primary-dark text-black font-semibold py-4 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 text-lg shadow-lg shadow-primary/20"
                >
                    {loading ? (
                        <span className="material-symbols-rounded animate-spin">progress_activity</span>
                    ) : isLastSlide ? (
                        'Comenzar'
                    ) : (
                        <>Continuar <span className="material-symbols-rounded">arrow_forward</span></>
                    )}
                </button>
                <p className="text-center text-sm text-gray-400">Paso {currentSlide + 1} de {slides.length}</p>
            </div>
        </div>
    );
}
