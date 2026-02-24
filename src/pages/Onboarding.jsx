import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const Onboarding = () => {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)

  const handleContinue = async () => {
    setIsLoading(true)
    try {
      navigate('/onboarding')
    } catch (error) {
      console.error('Error al iniciar', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mx-auto flex h-full min-h-screen w-full max-w-md flex-col overflow-hidden bg-background-light dark:bg-background-dark relative shadow-2xl">
      <header className="flex w-full items-center justify-between px-6 pt-12 pb-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-8 rounded-full bg-primary shadow-[0_0_8px_rgba(13,242,89,0.4)]"></div>
          <div className="h-2 w-2 rounded-full bg-slate-200 dark:bg-slate-700"></div>
          <div className="h-2 w-2 rounded-full bg-slate-200 dark:bg-slate-700"></div>
        </div>
        <button
          className="text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          onClick={() => navigate('/dashboard')}
        >
          Omitir
        </button>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="relative mb-10 mt-4 flex w-full items-center justify-center">
          <div className="absolute inset-0 m-auto h-64 w-64 rounded-full bg-gradient-to-tr from-primary/20 to-transparent blur-2xl dark:from-primary/10"></div>
          <div
            className="relative z-10 aspect-square w-full max-w-[280px] bg-contain bg-center bg-no-repeat drop-shadow-xl transition-transform duration-700 hover:scale-105"
            style={{
              backgroundImage:
                "url('https://lh3.googleusercontent.com/aida-public/AB6AXuB8WJO6F7c9muCeQaWuUym0vkZYHjXcoDHqRt0lhZHUgyxxOc9h0Aj1qoZB2-i8Xv4XRuXhk5lmQyJD3pOS-zN_BcnXPO0XmSuMmnFYKwhMF6pErEE5fdSZhtY0FUeHs2exrW3K8dpqFDnVKPi0x89s2py51w5wU1b5wM1Jt1JbU_yAjCca_2orAtVTgF4yLJe92TTjNKeU8a2ibrORmcH4LJwdPABa11J6tZKX3KkD6uErXSaUWinogrJ02WMXiu8LT1ANB_DpfNY-')",
            }}
          ></div>
        </div>
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            ¡Bienvenido a tu <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-600 dark:to-emerald-400">
              libertad financiera!
            </span>
          </h1>
          <p className="mx-auto max-w-[320px] text-base font-normal leading-relaxed text-slate-500 dark:text-slate-400">
            Toma el control de tus finanzas en{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-200">RD$</span>{' '}
            y alcanza tus metas mas rapido.
          </p>
        </div>
      </main>
      <footer className="w-full px-6 pb-10 pt-6">
        <button
          className="group relative flex h-14 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-primary transition-all active:scale-[0.98] hover:shadow-[0_0_20px_rgba(13,242,89,0.3)] disabled:cursor-not-allowed disabled:opacity-70"
          onClick={handleContinue}
          disabled={isLoading}
        >
          <span className="relative z-10 text-lg font-bold text-slate-900">
            {isLoading ? 'Conectando...' : 'Continuar'}
          </span>
          <div className="absolute inset-0 -translate-x-full bg-white/20 transition-transform duration-300 group-hover:translate-x-0"></div>
          <span className="material-symbols-outlined relative z-10 ml-2 text-slate-900 transition-transform duration-300 group-hover:translate-x-1">
            arrow_forward
          </span>
        </button>
        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-600">Paso 1 de 3</p>
      </footer>
    </div>
  )
}

export default Onboarding
