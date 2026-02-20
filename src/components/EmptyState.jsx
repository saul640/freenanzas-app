import { Link } from 'react-router-dom'

const EmptyState = ({ title, description }) => (
  <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 dark:border-gray-800 bg-surface-light dark:bg-surface-dark p-6 text-center shadow-sm">
    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
      <span className="material-symbols-outlined">savings</span>
    </div>
    <div>
      <p className="font-semibold">{title}</p>
      <p className="text-xs text-gray-400 mt-1">{description}</p>
    </div>
    <Link
      to="/add"
      className="mt-2 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-slate-900"
    >
      Crear tu primera transaccion
    </Link>
  </div>
)

export default EmptyState
