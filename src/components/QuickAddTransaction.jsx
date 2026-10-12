import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { useAuth } from '../hooks/useAuth';
import { functions, storage } from '../firebase';
import { formatDopFromMinorUnits, parseDopToMinorUnits } from '../utils/money';

const EXPENSE_CATEGORIES = ['Comida', 'Transporte', 'Renta', 'Salud', 'Ocio', 'Ahorro'];
const INCOME_CATEGORIES = ['Salario', 'Freelance', 'Rendimientos', 'Otros'];
const UNCATEGORIZED = 'Sin clasificar';
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const newRequestId = () => globalThis.crypto.randomUUID();
const getToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const getTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const getDraftKey = (uid) => `freenanzas:quick-transaction:${uid}`;
const createEmptyDraft = () => ({
  type: 'expense', amount: '', date: getToday(), category: 'Comida', note: '', merchant: '',
  receiptPath: '', requestId: newRequestId(), requestStatus: 'editing',
});
const readDraft = (uid) => {
  if (!uid || typeof window === 'undefined') return createEmptyDraft();
  try {
    const saved = JSON.parse(window.localStorage.getItem(getDraftKey(uid)) || 'null');
    return saved?.requestId ? { ...createEmptyDraft(), ...saved } : createEmptyDraft();
  } catch {
    return createEmptyDraft();
  }
};
const isValidDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};
const getSaveError = (error) => {
  if (error?.code === 'functions/unauthenticated') return 'La sesión venció. Vuelve a iniciar sesión; conservamos este formulario.';
  if (error?.code === 'functions/permission-denied') return 'No tienes permiso para guardar este movimiento.';
  if (error?.code === 'functions/invalid-argument') return error.message || 'Revisa los datos del movimiento.';
  if (error?.code === 'functions/failed-precondition') return 'No encontramos el comprobante cargado. Selecciónalo otra vez para reintentar.';
  if (error?.code === 'functions/already-exists') return 'Este intento ya está vinculado a otro movimiento. Revisa el historial antes de registrar uno nuevo.';
  if (error?.code === 'storage/unauthorized') return 'No tienes permiso para adjuntar este comprobante.';
  return 'No pudimos confirmar el guardado. Conservamos los datos: reintenta para comprobarlo sin duplicar.';
};

export default function QuickAddTransaction() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const [draft, setDraft] = useState(() => readDraft(uid));
  const [receiptFile, setReceiptFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [draftWarning, setDraftWarning] = useState('');
  const [captureNotice, setCaptureNotice] = useState('');
  const amountRef = useRef(null);
  const alertRef = useRef(null);
  const captureHandledRef = useRef(false);
  const captureDraft = location.state?.captureDraft;
  const captureDisclosure = location.state?.captureDisclosure;
  const [keyboardInset, setKeyboardInset] = useState(0);
  const categories = useMemo(() => draft.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES, [draft.type]);
  const amountMinor = parseDopToMinorUnits(draft.amount);
  const hasPendingResult = draft.requestStatus === 'pending';
  const disabled = saving || hasPendingResult;

  useEffect(() => {
    if (!uid) return;
    const captured = captureDraft;
    if (captured?.captureStatus === 'draft' && !captureHandledRef.current) {
      captureHandledRef.current = true;
      const existing = readDraft(uid);
      if (existing.requestStatus === 'pending') {
        setDraft(existing);
        setCaptureNotice('Hay un guardado anterior pendiente de confirmar. Conservamos ese intento; revisa el historial antes de iniciar otro.');
      } else {
        const hasPriorData = Boolean(existing.amount || existing.note || existing.merchant || existing.receiptPath);
        const next = {
          ...createEmptyDraft(),
          ...captured,
          ...(hasPriorData ? {
            amount: existing.amount,
            note: existing.note,
            merchant: existing.merchant,
            receiptPath: existing.receiptPath,
            date: existing.date,
            type: existing.type,
            category: existing.category,
          } : {}),
          requestId: newRequestId(),
          requestStatus: 'editing',
        };
        setDraft(next);
        setCaptureNotice(`${captureDisclosure || 'Captura simulada; completa los campos manualmente.'}${hasPriorData ? ' Conservamos además los campos del borrador anterior.' : ''}`);
      }
      return;
    }
    setDraft(readDraft(uid));
  }, [uid, location.key, captureDraft, captureDisclosure]);

  useEffect(() => {
    if (!uid) return;
    try {
      window.localStorage.setItem(getDraftKey(uid), JSON.stringify(draft));
      setDraftWarning('');
    } catch {
      setDraftWarning('El navegador no puede conservar este borrador tras recargar. Mantén esta pantalla abierta si el resultado del guardado queda pendiente.');
    }
  }, [draft, uid]);

  useEffect(() => {
    if (!error) return;
    alertRef.current?.focus();
  }, [error]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const updateInset = () => setKeyboardInset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
    updateInset();
    viewport.addEventListener('resize', updateInset);
    viewport.addEventListener('scroll', updateInset);
    return () => {
      viewport.removeEventListener('resize', updateInset);
      viewport.removeEventListener('scroll', updateInset);
    };
  }, []);

  const updateDraft = (patch) => {
    setDraft((current) => {
      const changedSubmission = current.requestStatus === 'editing' && current.requestId;
      const next = { ...current, ...patch };
      if (changedSubmission) next.requestId = current.requestStatus === 'editing' ? current.requestId : newRequestId();
      next.requestStatus = current.requestStatus === 'pending' ? 'pending' : 'editing';
      return next;
    });
    setError('');
  };

  const handleTypeChange = (type) => {
    const nextCategory = (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).includes(draft.category)
      ? draft.category
      : (type === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
    updateDraft({ type, category: nextCategory });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (hasPendingResult) {
      setDraft((current) => ({ ...current, requestStatus: 'editing' }));
    }
    if (!amountMinor) {
      setError('Escribe un importe mayor que cero con hasta dos decimales. Usa punto o coma decimal y no agregues separadores de miles.');
      return;
    }
    if (!isValidDate(draft.date)) {
      setError('Elige una fecha válida.');
      return;
    }
    if (!draft.type || !draft.category) {
      setError('Selecciona si es gasto o ingreso y una categoría, o elige «Sin clasificar».');
      return;
    }
    if (!functions) {
      setError('El servicio de guardado no está disponible en esta instalación.');
      return;
    }
    if (receiptFile && (!RECEIPT_TYPES.includes(receiptFile.type) || receiptFile.size > MAX_RECEIPT_BYTES)) {
      setError('El comprobante debe ser una imagen o PDF de hasta 10 MB.');
      return;
    }

    const requestId = draft.requestId || newRequestId();
    const startingDraft = { ...draft, requestId, requestStatus: 'pending' };
    setDraft(startingDraft);
    setSaving(true);
    setError('');

    try {
      let receiptPath = startingDraft.receiptPath;
      if (receiptFile && !receiptPath) {
        if (!storage) throw Object.assign(new Error('Storage no disponible'), { code: 'storage/unknown' });
        const safeName = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'comprobante';
        receiptPath = `transaction-receipts/${uid}/${requestId}/${safeName}`;
        await uploadBytes(ref(storage, receiptPath), receiptFile, { contentType: receiptFile.type });
        setDraft((current) => ({ ...current, receiptPath }));
      }

      const saveTransaction = httpsCallable(functions, 'registerQuickTransaction');
      const response = await saveTransaction({
        requestId,
        type: startingDraft.type,
        amountMinor,
        currency: 'DOP',
        category: startingDraft.category,
        date: startingDraft.date,
        timeZone: getTimeZone(),
        note: startingDraft.note.trim(),
        merchant: startingDraft.merchant.trim(),
        receiptPath,
      });

      const transactionId = response.data?.transactionId;
      if (!transactionId) throw new Error('El servidor no confirmó el movimiento.');
      window.localStorage.removeItem(getDraftKey(uid));
      setReceiptFile(null);
      setDraft(createEmptyDraft());
      setSaved({ type: startingDraft.type, amount: formatDopFromMinorUnits(amountMinor), transactionId });
    } catch (saveError) {
      const uncertain = ['functions/unavailable', 'functions/deadline-exceeded', 'functions/internal', 'functions/unknown', 'storage/unknown'].includes(saveError?.code)
        || !saveError?.code;
      setDraft((current) => ({
        ...current,
        ...(saveError?.code === 'functions/failed-precondition' ? { receiptPath: '' } : {}),
        requestId,
        requestStatus: uncertain ? 'pending' : 'editing',
      }));
      setError(getSaveError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleRegisterAnother = () => {
    const empty = createEmptyDraft();
    setDraft(empty);
    setSaved(null);
    setError('');
    setReceiptFile(null);
    requestAnimationFrame(() => amountRef.current?.focus());
  };

  return (
    <div className="quick-transaction-screen min-h-screen bg-[#f7f9f8] dark:bg-slate-900 text-slate-900 dark:text-slate-100 pb-44">
      <header className="px-5 sm:px-8 pt-6 pb-4 flex items-center gap-4">
        <button type="button" onClick={() => navigate(-1)} aria-label="Volver" className="min-w-11 min-h-11 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <span aria-hidden="true" className="material-symbols-rounded">arrow_back</span>
        </button>
        <div>
          <h1 className="text-xl font-bold">Registrar movimiento</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">Anota un ingreso o gasto en pocos pasos.</p>
        </div>
      </header>

      <form id="quick-transaction-form" onSubmit={handleSubmit} noValidate className="mx-auto w-full max-w-xl px-5 sm:px-8 space-y-5" aria-describedby={error ? 'quick-transaction-error' : undefined}>
        {captureNotice && <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:bg-sky-950/40 dark:text-sky-100">{captureNotice}</div>}
        {draft.requestStatus === 'pending' && (
          <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
            El resultado del último intento aún no se confirma. Reintenta con estos mismos datos para comprobarlo sin duplicar.
          </div>
        )}
        {draftWarning && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">{draftWarning}</div>}

        <fieldset disabled={disabled || Boolean(saved)} className="min-w-0 space-y-5 disabled:opacity-90">
          <legend className="sr-only">Tipo de movimiento</legend>
          <div className="grid grid-cols-2 rounded-2xl bg-slate-200/70 dark:bg-slate-800 p-1.5" role="group" aria-label="Tipo de movimiento">
            {['expense', 'income'].map((type) => (
              <button key={type} type="button" aria-pressed={draft.type === type} onClick={() => handleTypeChange(type)}
                className={`min-h-12 rounded-xl font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${draft.type === type ? 'bg-white text-slate-900 shadow dark:bg-slate-700 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                {type === 'expense' ? 'Gasto' : 'Ingreso'}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="quick-amount" className="block text-sm font-semibold mb-2">Importe</label>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 dark:border-slate-600 dark:bg-slate-800 focus-within:ring-2 focus-within:ring-primary">
              <span className="text-lg font-bold" aria-label="Pesos dominicanos">RD$</span>
              <input ref={amountRef} id="quick-amount" name="amount" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={draft.amount}
                onChange={(event) => updateDraft({ amount: event.target.value })} aria-invalid={Boolean(error && !amountMinor)} aria-describedby="quick-currency-help"
                className="min-w-0 flex-1 border-0 bg-transparent text-2xl font-bold tabular-nums focus:ring-0" disabled={disabled || Boolean(saved)} />
              <span className="text-xs text-slate-500">DOP</span>
            </div>
            <p id="quick-currency-help" className="mt-1 text-xs text-slate-600 dark:text-slate-300">Pesos dominicanos · hasta 2 decimales · usa punto o coma, sin separadores de miles.</p>
          </div>

          <div>
            <label htmlFor="quick-date" className="block text-sm font-semibold mb-2">Fecha</label>
            <input id="quick-date" name="date" type="date" value={draft.date} onChange={(event) => updateDraft({ date: event.target.value })}
              className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-800" disabled={disabled || Boolean(saved)} />
          </div>

          <fieldset className="min-w-0">
            <legend className="block text-sm font-semibold mb-2">Categoría</legend>
            <div className="grid min-w-0 grid-cols-2 sm:grid-cols-3 gap-2" role="group" aria-label="Categoría del movimiento">
              {categories.map((category) => (
                <button key={category} type="button" aria-pressed={draft.category === category} onClick={() => updateDraft({ category })}
                className={`min-h-11 min-w-0 rounded-xl border px-3 text-sm font-medium text-left break-words focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${draft.category === category ? 'border-emerald-700 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-100' : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'}`}>
                  {category}
                </button>
              ))}
              <button type="button" aria-pressed={draft.category === UNCATEGORIZED} onClick={() => updateDraft({ category: UNCATEGORIZED })}
                className={`min-h-11 rounded-xl border px-3 text-sm font-medium text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${draft.category === UNCATEGORIZED ? 'border-amber-700 bg-amber-50 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100' : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'}`}>
                Sin clasificar
              </button>
            </div>
          </fieldset>

          <details className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <summary className="cursor-pointer px-4 py-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Más detalles (opcionales)</summary>
            <div className="px-4 pb-4 space-y-4">
              <div>
                <label htmlFor="quick-note" className="block text-sm font-medium mb-1">Nota</label>
                <input id="quick-note" maxLength={500} value={draft.note} onChange={(event) => updateDraft({ note: event.target.value })} placeholder="Ej. compra semanal"
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-900" disabled={disabled || Boolean(saved)} />
              </div>
              <div>
                <label htmlFor="quick-merchant" className="block text-sm font-medium mb-1">Comercio o fuente</label>
                <input id="quick-merchant" maxLength={120} value={draft.merchant} onChange={(event) => updateDraft({ merchant: event.target.value })} placeholder="Ej. supermercado o nómina"
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-900" disabled={disabled || Boolean(saved)} />
              </div>
              <div>
                <label htmlFor="quick-receipt" className="block text-sm font-medium mb-1">Comprobante (opcional)</label>
                <input id="quick-receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setReceiptFile(event.target.files?.[0] || null)}
                  className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 dark:file:bg-slate-700" disabled={disabled || Boolean(saved)} />
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Imagen o PDF, máximo 10 MB. Se guarda como archivo adjunto; no se analiza automáticamente.</p>
                {draft.receiptPath && <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Comprobante cargado y listo para vincular al movimiento.</p>}
                {receiptFile && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Archivo seleccionado: {receiptFile.name}</p>}
              </div>
            </div>
          </details>
        </fieldset>

        {error && <div id="quick-transaction-error" ref={alertRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 focus:outline focus:outline-2 focus:outline-red-700 dark:bg-red-950/40 dark:text-red-100">{error}</div>}
      </form>

      <div className="fixed left-0 right-0 z-20 mx-auto max-w-xl px-5 pb-3 pt-3 bg-gradient-to-t from-[#f7f9f8] via-[#f7f9f8]/95 to-transparent dark:from-slate-900 dark:via-slate-900/95" style={{ bottom: `${Math.max(keyboardInset + 12, 18)}px` }}>
        {saved ? (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 shadow-lg dark:bg-emerald-950/70" role="status" aria-live="polite">
            <p className="mb-2 text-sm font-semibold text-emerald-950 dark:text-emerald-100">{saved.type === 'income' ? 'Ingreso' : 'Gasto'} de RD$ {saved.amount} guardado.</p>
            <button type="button" onClick={handleRegisterAnother} className="min-h-11 w-full rounded-xl bg-emerald-700 px-4 font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900">Registrar otro</button>
          </div>
        ) : (
          <button type="submit" form="quick-transaction-form" disabled={saving} className="min-h-14 w-full rounded-2xl bg-emerald-700 px-5 text-base font-bold text-white shadow-lg disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900">
            {saving ? 'Guardando…' : hasPendingResult ? 'Reintentar y comprobar' : 'Guardar movimiento'}
          </button>
        )}
      </div>

    </div>
  );
}
