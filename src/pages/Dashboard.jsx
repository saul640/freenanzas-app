import BottomNav from '../components/BottomNav'
import EmptyState from '../components/EmptyState'
import { useBudgets } from '../hooks/useBudgets'
import { useTransactions } from '../hooks/useTransactions'
import { getCategoryById } from '../data/categories'
import { formatNumber, formatSignedCurrency } from '../utils/format'
import { formatTransactionDate, getMonthKey } from '../utils/date'

const DEFAULT_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBEhQLByC5B2cnrrLNI-j4SgWy6ENFeUmXzOtbmHecH5YdqTZioYUewvKGyzkhTLO_IHPVumKl4npXj6JtHwrJ0E6XyOunyFwweCxb2QbagtMzJ7_UcIrLhVurm9n3Gqj8-rx1ePbaOTgS1N2teInUld8RabIuNcGXZJI6c6-DOcDhrPwaAhg7bxhiF8p2nEz--BXDDSQtWFH4kG-z8aUpE9myQmR3wnVyQ1eSlhso4Va4NyirKEGo0ed-BmoPD5e4xDF9dT7xInDNQ'

const Dashboard = ({ user }) => {
  const monthKey = getMonthKey()
  const { transactions } = useTransactions(user?.uid)
  const { budgets } = useBudgets(user?.uid, monthKey)
  const name = user?.displayName?.split(' ')[0] ?? 'Juan'
  const avatarUrl = user?.photoURL ?? DEFAULT_AVATAR

  const monthTransactions = transactions.filter((transaction) => {
    if (transaction.monthKey) return transaction.monthKey === monthKey
    if (!transaction.createdAt) return false
    return getMonthKey(transaction.createdAt) === monthKey
  })

  const totalIncome = monthTransactions
    .filter((transaction) => transaction.type === 'ingreso')
    .reduce((sum, transaction) => sum + (transaction.amount ?? 0), 0)

  const totalExpense = monthTransactions
    .filter((transaction) => transaction.type === 'gasto')
    .reduce((sum, transaction) => sum + (transaction.amount ?? 0), 0)

  const balance = totalIncome - totalExpense

  const totalBudget = budgets.reduce((sum, budget) => sum + (budget.limit ?? 0), 0)
  const spentThisMonth = monthTransactions
    .filter((transaction) => transaction.type === 'gasto')
    .reduce((sum, transaction) => sum + (transaction.amount ?? 0), 0)

  const budgetProgress = totalBudget ? Math.min(100, Math.round((spentThisMonth / totalBudget) * 100)) : 0
  const recentTransactions = transactions.filter((transaction) => transaction.type === 'gasto').slice(0, 4)

  return (
    <div className="w-full max-w-md bg-background-light dark:bg-background-dark min-h-screen flex flex-col relative shadow-2xl overflow-hidden">
      <header className="pt-12 pb-4 px-6 flex items-center justify-between bg-surface-light dark:bg-surface-dark sticky top-0 z-10 shadow-sm border-b border-gray-100 dark:border-gray-800">
        <div className="flex flex-col">
          <span className="text-text-sub dark:text-gray-400 text-sm font-medium">Bienvenido de nuevo,</span>
          <h1 className="text-text-main dark:text-white text-2xl font-bold tracking-tight">Hola, {name} 👋</h1>
        </div>
        <button className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary/20">
          <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
        </button>
      </header>
      <main className="flex-1 overflow-y-auto pb-24 px-6 space-y-6 pt-6">
        <section className="bg-surface-light dark:bg-surface-dark rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-40 h-40 bg-primary/10 rounded-full blur-3xl"></div>
          <div className="relative z-10">
            <p className="text-text-sub dark:text-gray-400 font-medium text-sm">Saldo Total</p>
            <h2 className="text-4xl font-bold text-text-main dark:text-white mt-1">
              RD$ {formatNumber(balance)}
              <span className="text-xl text-gray-400 font-normal">.00</span>
            </h2>
          </div>
        </section>
        <section className="grid grid-cols-2 gap-4">
          <button className="flex flex-col items-center gap-3 p-5 rounded-xl bg-surface-light dark:bg-surface-dark border border-gray-100 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined">arrow_upward</span>
            </div>
            <span className="font-semibold">Ingresos</span>
          </button>
          <button className="flex flex-col items-center gap-3 p-5 rounded-xl bg-surface-light dark:bg-surface-dark border border-gray-100 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center">
              <span className="material-symbols-outlined">arrow_downward</span>
            </div>
            <span className="font-semibold">Gastos</span>
          </button>
        </section>
        <section className="bg-surface-light dark:bg-surface-dark rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold mb-3">Presupuesto del mes</h3>
          <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
            <div className="bg-primary h-3 rounded-full" style={{ width: `${budgetProgress}%` }}></div>
          </div>
        </section>
        <section className="space-y-4">
          <h3 className="text-lg font-bold">Gastos Recientes</h3>
          {recentTransactions.length === 0 ? (
            <EmptyState
              title="Sin transacciones aun"
              description="Registra tu primer ingreso o gasto para ver el resumen mensual."
            />
          ) : (
            recentTransactions.map((transaction) => {
              const category = getCategoryById(transaction.categoryId)
              const isExpense = transaction.type === 'gasto'
              return (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 bg-surface-light rounded-xl shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${category?.iconClass ?? 'bg-slate-100 text-slate-600'}`}
                    >
                      <span className="material-symbols-outlined">{category?.icon ?? 'payments'}</span>
                    </div>
                    <div>
                      <p className="font-bold text-sm">{transaction.categoryLabel ?? 'Transaccion'}</p>
                      <p className="text-xs text-gray-400">
                        {formatTransactionDate(transaction.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span className="font-bold">
                    {formatSignedCurrency(transaction.amount ?? 0, { isNegative: isExpense })}
                  </span>
                </div>
              )
            })
          )}
        </section>
      </main>
      <BottomNav />
    </div>
  )
}

export default Dashboard
