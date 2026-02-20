import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Función helper para determinar si un icono está activo
  const isActive = (path) => {
    // En este caso, si estamos en /, mostramos 'home' activo.
    // Si hay una ruta especifica como /budgets, mostramos budgets.
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <>
      {/* Floating Action Button (Centrado en el dock) */}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
        <button
          onClick={() => navigate('/add')}
          className="w-16 h-16 bg-primary text-black rounded-2xl flex items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.12)] active:scale-90 transition-transform border-4 border-white"
        >
          <span className="material-symbols-rounded text-3xl">qr_code_scanner</span>
        </button>
      </div>

      {/* Bottom Navigation */}
      {/* Agregamos pb-6 o env(safe-area-inset-bottom) como un div contenedor o inline style seguro para no cortar íconos en iOS */}
      <nav
        className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white px-6 pt-3 pb-5 flex justify-between items-center border-t border-gray-100 z-10"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 20px) + 12px)' }}
      >
        <button
          onClick={() => navigate('/')}
          className={`flex flex-col items-center gap-1 transition-colors ${isActive('/') ? 'text-primary' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <span className={`${isActive('/') ? 'material-symbols-rounded' : 'material-symbols-outlined'} text-[24px]`}>home</span>
          <span className={`text-[10px] ${isActive('/') ? 'font-semibold' : 'font-medium'}`}>Inicio</span>
        </button>

        {/* Acción para 'Movimientos' o Historial. Si no hay ruta aún, redirigiremos al inicio con foco o crearemos view */}
        <button
          onClick={() => navigate('/transactions')}
          className={`flex flex-col items-center gap-1 transition-colors ${isActive('/transactions') ? 'text-primary' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <span className={`${isActive('/transactions') ? 'material-symbols-rounded' : 'material-symbols-outlined'} text-[24px]`}>swap_horiz</span>
          <span className={`text-[10px] ${isActive('/transactions') ? 'font-semibold' : 'font-medium'}`}>Movimientos</span>
        </button>

        <div className="w-16" /> {/* Espaciador central debajo del FAB */}

        <button
          onClick={() => navigate('/budgets')}
          className={`flex flex-col items-center gap-1 transition-colors ${isActive('/budgets') ? 'text-primary' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <span className={`${isActive('/budgets') ? 'material-symbols-rounded' : 'material-symbols-outlined'} text-[24px]`}>donut_small</span>
          <span className={`text-[10px] ${isActive('/budgets') ? 'font-semibold' : 'font-medium'}`}>Presupuesto</span>
        </button>

        <button
          onClick={() => navigate('/profile')}
          className={`flex flex-col items-center gap-1 transition-colors ${isActive('/profile') ? 'text-primary' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <span className={`${isActive('/profile') ? 'material-symbols-rounded' : 'material-symbols-outlined'} text-[24px]`}>person</span>
          <span className={`text-[10px] ${isActive('/profile') ? 'font-semibold' : 'font-medium'}`}>Perfil</span>
        </button>
      </nav>
    </>
  );
};

export default BottomNav;
