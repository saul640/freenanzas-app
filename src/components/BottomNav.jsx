import { Link, useLocation } from 'react-router-dom'

const BottomNav = () => {
  const location = useLocation()
  const isActive = (path) => location.pathname === path

  return (
    <nav className="bg-surface-light dark:bg-surface-dark border-t border-gray-200 px-6 py-3 flex justify-between items-center z-20 sticky bottom-0 w-full">
      <Link
        to="/dashboard"
        className={`flex flex-col items-center ${isActive('/dashboard') ? 'text-primary' : 'text-gray-400'}`}
      >
        <span className="material-symbols-outlined">home</span>
        <span className="text-[10px]">Inicio</span>
      </Link>
      <div className="relative -top-6">
        <Link
          to="/add"
          className="w-14 h-14 bg-black dark:bg-white text-white dark:text-black rounded-full shadow-lg flex items-center justify-center"
        >
          <span className="material-symbols-outlined">add</span>
        </Link>
      </div>
      <Link
        to="/budgets"
        className={`flex flex-col items-center ${isActive('/budgets') ? 'text-primary' : 'text-gray-400'}`}
      >
        <span className="material-symbols-outlined">person</span>
        <span className="text-[10px]">Perfil</span>
      </Link>
    </nav>
  )
}

export default BottomNav
