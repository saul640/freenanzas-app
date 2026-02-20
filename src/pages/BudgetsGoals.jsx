import { useMemo, useState } from 'react'
import { getCategoryById, isSavingsCategory } from '../data/categories'
import { useBudgets } from '../hooks/useBudgets'
import { useTransactions } from '../hooks/useTransactions'
import { useUserProfile } from '../hooks/useUserProfile'
import { formatCurrency, formatNumber } from '../utils/format'
import { getMonthKey } from '../utils/date'

const BudgetsGoals = ({ user }) => {
  const [tab, setTab] = useState('budgets')
  const monthKey = getMonthKey()
  const { budgets } = useBudgets(user?.uid, monthKey)
  const { transactions } = useTransactions(user?.uid)
  const { profile } = useUserProfile(user?.uid)

  const monthExpenses = useMemo(
    () =>
      transactions.filter((transaction) => {
        const matchesMonth = transaction.monthKey
          ? transaction.monthKey === monthKey
          : transaction.createdAt && getMonthKey(transaction.createdAt) === monthKey
        return matchesMonth && transaction.type === 'gasto'
      }),
    [transactions, monthKey],
  )

  const spentByCategory = useMemo(() => {
    return monthExpenses.reduce((accumulator, transaction) => {
      const key = transaction.categoryId
      if (!key) return accumulator
      accumulator[key] = (accumulator[key] ?? 0) + (transaction.amount ?? 0)
      return accumulator
    }, {})
  }, [monthExpenses])

  const totalBudget = budgets.reduce((sum, budget) => sum + (budget.limit ?? 0), 0)

  const savingsTotal = transactions
    .filter((transaction) => isSavingsCategory(transaction.categoryId))
    .reduce((sum, transaction) => sum + (transaction.amount ?? 0), 0)

  const emergencyGoal = profile?.emergencyGoal ?? 100000
  const savingsPercentage = emergencyGoal
    ? Math.min(100, Math.round((savingsTotal / emergencyGoal) * 100))
    : 0

  return (
    <div className="w-full max-w-md mx-auto min-h-screen flex flex-col bg-background-light text-slate-900">
      <header className="bg-surface-light px-4 pt-12 pb-4 shadow-sm">
        <h1 className="text-xl font-bold mb-4">Mis Finanzas</h1>
        <div className="flex p-1 bg-gray-100 rounded-xl">
          <button
            className={`flex-1 text-center py-2 rounded-lg shadow-sm font-semibold ${
              tab === 'budgets' ? 'bg-white' : 'text-gray-500'
            }`}
            onClick={() => setTab('budgets')}
          >
            Presupuestos
          </button>
          <button
            className={`flex-1 text-center py-2 rounded-lg shadow-sm font-semibold ${
              tab === 'goals' ? 'bg-white' : 'text-gray-500'
            }`}
            onClick={() => setTab('goals')}
          >
            Metas
          </button>
        </div>
      </header>
      <main className="flex-1 p-4 space-y-6 overflow-y-auto pb-24">
        {tab === 'budgets' ? (
          <>
            <div className="flex justify-between items-end">
              <h2 className="text-3xl font-bold">RD$ {formatNumber(totalBudget)}</h2>
              <span className="bg-primary/20 text-primary-dark px-3 py-1 rounded-full text-xs font-bold">
                Mes Actual
              </span>
            </div>
            {budgets.map((budget) => {
              const category = getCategoryById(budget.categoryId)
              const spent = spentByCategory[budget.categoryId] ?? 0
              const limit = budget.limit ?? 0
              const percentage = limit ? Math.min(100, Math.round((spent / limit) * 100)) : 0
              const isOver = limit > 0 && spent > limit

              return (
                <div
                  key={budget.id ?? budget.categoryId}
                  className="bg-surface-light p-4 rounded-2xl shadow-sm border border-gray-100"
                >
                  <div className="flex justify-between mb-3">
                    <div className="flex gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          category?.iconClass ?? 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <span className="material-symbols-outlined">{category?.icon ?? 'payments'}</span>
                      </div>
                      <div>
                        <h3 className="font-bold">{category?.label ?? 'Categoria'}</h3>
                        <p className={`text-xs ${isOver ? 'text-danger' : 'text-gray-400'}`}>
                          {formatCurrency(spent)} / {formatCurrency(limit)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full w-full overflow-hidden">
                    <div
                      className={`${isOver ? 'bg-danger' : 'bg-primary'} h-full`}
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              )
            })}
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold mt-6 mb-4">Metas (Fondo de Emergencia)</h2>
            <div className="bg-surface-light p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">savings</span>
                  Fondo Seguridad
                </h3>
                <p className="text-2xl font-extrabold mt-2">{formatCurrency(savingsTotal)}</p>
                <p className="text-xs text-gray-400">Meta: {formatCurrency(emergencyGoal)}</p>
              </div>
              <div className="w-20 h-20 rounded-full border-8 border-primary flex items-center justify-center font-bold">
                {savingsPercentage}%
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default BudgetsGoals
