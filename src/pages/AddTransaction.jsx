import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TRANSACTION_CATEGORIES } from '../data/categories'
import { addTransaction } from '../lib/firestore'

const AddTransaction = ({ user }) => {
  const navigate = useNavigate()
  const [type, setType] = useState('gasto')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAmountChange = (event) => {
    const value = event.target.value.replace(/[^0-9]/g, '')
    setAmount(value)
  }

  const handleSubmit = async () => {
    setError('')
    const numericAmount = Number(amount)

    if (!numericAmount || !categoryId) {
      setError('Completa el monto y selecciona una categoria para continuar.')
      return
    }

    if (!user?.uid) {
      setError('Inicia sesion para guardar tu transaccion en la nube.')
      return
    }

    try {
      setSaving(true)
      await addTransaction({
        userId: user.uid,
        type,
        amount: numericAmount,
        categoryId,
      })
      navigate('/dashboard')
    } catch (err) {
      console.error('Error guardando transaccion', err)
      setError('No pudimos guardar la transaccion. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-background-light text-slate-900 min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-4 border-b border-slate-200">
        <button className="text-sm font-medium" onClick={() => navigate('/dashboard')}>
          Cancelar
        </button>
        <h1 className="text-lg font-bold">Añadir Transaccion</h1>
        <div className="w-10"></div>
      </header>
      <main className="flex-1 p-4 flex flex-col gap-6 max-w-md mx-auto w-full">
        <div className="flex bg-slate-200 rounded-xl p-1">
          <button
            className={`flex-1 py-2 rounded-lg shadow-sm font-medium ${
              type === 'gasto' ? 'bg-white' : 'text-slate-500'
            }`}
            onClick={() => setType('gasto')}
          >
            Gasto
          </button>
          <button
            className={`flex-1 py-2 rounded-lg shadow-sm font-medium ${
              type === 'ingreso' ? 'bg-white' : 'text-slate-500'
            }`}
            onClick={() => setType('ingreso')}
          >
            Ingreso
          </button>
        </div>
        <div className="text-center py-6">
          <p className="text-sm text-slate-400 mb-2 font-medium">MONTO</p>
          <input
            type="text"
            inputMode="numeric"
            placeholder="RD$ 0"
            className="w-full text-center text-5xl font-extrabold bg-transparent border-none outline-none focus:ring-0"
            value={amount}
            onChange={handleAmountChange}
          />
        </div>
        <div>
          <h3 className="font-semibold mb-3">Categoria</h3>
          <div className="grid grid-cols-3 gap-3">
            {TRANSACTION_CATEGORIES.map((category) => {
              const isSelected = categoryId === category.id
              return (
                <button
                  key={category.id}
                  className={`p-3 rounded-xl flex flex-col items-center gap-2 relative border ${
                    isSelected ? 'bg-white border-2 border-primary' : 'bg-white border-transparent'
                  }`}
                  onClick={() => setCategoryId(category.id)}
                >
                  <div
                    className={`w-10 h-10 flex rounded-full justify-center items-center ${
                      category.iconClass ?? 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <span className="material-symbols-outlined">{category.icon}</span>
                  </div>
                  <span className={`text-sm ${isSelected ? 'font-semibold' : 'font-medium text-slate-600'}`}>
                    {category.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </main>
      <footer className="p-4 pb-8">
        {error ? <p className="text-xs text-danger mb-2">{error}</p> : null}
        <button
          className="w-full bg-primary text-black font-bold h-14 rounded-xl shadow-lg disabled:opacity-60"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? 'Guardando...' : 'Guardar Transaccion'}
        </button>
      </footer>
    </div>
  )
}

export default AddTransaction
