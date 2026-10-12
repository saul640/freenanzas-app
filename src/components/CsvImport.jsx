import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { createCaptureDraft, getCaptureDisclosure } from '../services/captureDraftAdapter';
import {
  correctCsvRow, detectCsvDelimiter, mapCsvRows, normalizeCsvHeader,
  parseDelimitedText, suggestCsvColumnMapping,
} from '../utils/csvImport';
import BottomNav from './BottomNav';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS_PER_BATCH = 100;
const DELIMITER_OPTIONS = [
  { value: ',', label: 'Coma (,)' }, { value: ';', label: 'Punto y coma (;)' },
  { value: '\t', label: 'Tabulador' }, { value: '|', label: 'Barra vertical (|)' },
];
const COLUMN_FIELDS = [
  ['date', 'Fecha (requerida)'], ['amount', 'Importe (requerido)'], ['type', 'Tipo (opcional)'],
  ['debit', 'Débito (alternativa)'], ['credit', 'Crédito (alternativa)'], ['description', 'Descripción o comercio'],
  ['currency', 'Moneda'], ['category', 'Categoría'], ['externalId', 'ID externo'],
];
const fieldStyle = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 dark:border-slate-600 dark:bg-slate-800 dark:text-white';

const sha256 = async (value) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
};

const getCallable = (name) => {
  if (!functions) throw new Error('Firebase Functions no está configurado.');
  return httpsCallable(functions, name);
};

const formatDop = (minor) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format((minor || 0) / 100);

function CaptureSourcePanel() {
  const navigate = useNavigate();
  const [photoReady, setPhotoReady] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const mediaRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const discardAudioRef = useRef(false);

  const stopVoice = (discard = false) => {
    discardAudioRef.current = discard;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (mediaRef.current?.state === 'recording') mediaRef.current.stop();
    else {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setVoiceRecording(false);
    }
  };

  const startVoice = async () => {
    setCaptureError(''); setVoiceReady(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Este navegador no permite grabar audio aquí. Puedes continuar con el formulario manual.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const chunks = [];
      const recorder = new MediaRecorder(stream);
      mediaRef.current = recorder;
      discardAudioRef.current = false;
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null; mediaRef.current = null; setVoiceRecording(false);
        const audio = discardAudioRef.current ? null : new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        setVoiceReady(Boolean(audio?.size));
        chunks.length = 0;
      };
      recorder.start(); setVoiceRecording(true);
      timerRef.current = window.setTimeout(() => stopVoice(false), 60_000);
    } catch (error) { setCaptureError(error.message || 'No se concedió el acceso al micrófono. Usa la alternativa manual.'); }
  };

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (mediaRef.current?.state === 'recording') mediaRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const continueToManualReview = (source) => {
    const captureDraft = createCaptureDraft(source);
    navigate('/add', { state: { captureDraft, captureDisclosure: getCaptureDisclosure(source) } });
  };

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800" aria-labelledby="capture-title">
      <div><h2 id="capture-title" className="font-bold">Otras fuentes · captura voluntaria</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Foto y voz abren el registro manual con campos vacíos. Los adaptadores son simulados: no hay OCR ni transcripción activos.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <label htmlFor="capture-photo" className="block text-sm font-semibold">Foto de un recibo (opcional)</label>
          <input id="capture-photo" type="file" accept="image/*" capture="environment" onChange={(event) => {
            const file = event.target.files?.[0]; event.target.value = '';
            if (!file) return;
            if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) { setCaptureError('Selecciona una imagen válida de hasta 10 MB.'); setPhotoReady(false); return; }
            setCaptureError(''); setPhotoReady(true);
          }} className="mt-2 block w-full text-sm file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 dark:file:bg-slate-700" />
          {photoReady && <><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Imagen solo en memoria del navegador; no se envió ni se conservó.</p><button type="button" onClick={() => continueToManualReview('photo-simulation')} className="mt-3 min-h-10 w-full rounded-lg bg-slate-900 px-3 text-sm font-bold text-white dark:bg-slate-600">Revisar manualmente</button></>}
        </div>
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-sm font-semibold">Nota de voz (opcional)</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">El permiso de micrófono solo se solicita al pulsar Iniciar. Máximo 60 segundos.</p>
          {!voiceRecording && !voiceReady && <button type="button" onClick={startVoice} className="mt-3 min-h-10 w-full rounded-lg border border-slate-400 px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">Iniciar grabación</button>}
          {voiceRecording && <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => stopVoice(false)} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-sm font-bold text-white">Detener</button><button type="button" onClick={() => { stopVoice(true); setVoiceReady(false); }} className="min-h-10 rounded-lg border border-slate-400 px-3 text-sm font-semibold">Cancelar</button></div>}
          {voiceReady && <><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">El audio no se guarda ni se envía; solo se usa en memoria durante la captura. No se transcribió.</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => continueToManualReview('voice-simulation')} className="min-h-10 rounded-lg bg-slate-900 px-2 text-xs font-bold text-white dark:bg-slate-600">Revisar manualmente</button><button type="button" onClick={() => setVoiceReady(false)} className="min-h-10 rounded-lg border border-slate-400 px-2 text-xs font-semibold">Descartar</button></div></>}
        </div>
      </div>
      {captureError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-100">{captureError} <button type="button" onClick={() => navigate('/add')} className="font-bold underline">Abrir registro manual</button></p>}
    </section>
  );
}

export default function CsvImport() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const fileRef = useRef(null);
  const [sourceFile, setSourceFile] = useState(null);
  const [fileBytes, setFileBytes] = useState(null);
  const [matrix, setMatrix] = useState([]);
  const [delimiter, setDelimiter] = useState('auto');
  const [encoding, setEncoding] = useState('utf-8');
  const [dateFormat, setDateFormat] = useState('iso');
  const [numberFormat, setNumberFormat] = useState('dot');
  const [mapping, setMapping] = useState({ date: -1, amount: -1, type: -1, description: -1, currency: -1, category: -1, externalId: -1 });
  const [rows, setRows] = useState([]);
  const [cards, setCards] = useState([]);
  const [accountChoice, setAccountChoice] = useState('');
  const [otherAccountName, setOtherAccountName] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savedBatch, setSavedBatch] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [reviewedDuplicates, setReviewedDuplicates] = useState({});
  const [excludedRows, setExcludedRows] = useState({});

  useEffect(() => {
    let active = true;
    if (!currentUser || !db) return undefined;
    getDocs(collection(db, 'users', currentUser.uid, 'creditCards'))
      .then((snapshot) => { if (active) setCards(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))); })
      .catch(() => { if (active) setError('No pudimos cargar las cuentas. Puedes reintentar o usar “Otra cuenta”.'); });
    return () => { active = false; };
  }, [currentUser]);

  const loadHistory = useCallback(async () => {
    if (!currentUser || !functions) return;
    setHistoryBusy(true);
    try {
      const result = await getCallable('listCsvImportBatches')({});
      setHistory(result.data.batches || []);
    } catch {
      setError('No se pudo cargar el historial de importaciones. Los movimientos ya guardados siguen disponibles en el historial.');
    } finally { setHistoryBusy(false); }
  }, [currentUser]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const reparse = useCallback((nextMatrix, nextMapping = mapping, nextDate = dateFormat, nextNumber = numberFormat) => {
    if (!nextMatrix.length) return;
    try {
      const result = mapCsvRows(nextMatrix, { mapping: nextMapping, dateFormat: nextDate, numberFormat: nextNumber });
      setRows(result.rows);
      setAnalysis(null);
      setReviewedDuplicates({});
      setExcludedRows({});
      setError('');
    } catch (parseError) {
      setRows([]);
      setError(parseError.message);
    }
  }, [dateFormat, mapping, numberFormat]);

  const handleChooseFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(''); setNotice(''); setSavedBatch(null); setAnalysis(null);
    if (!/\.csv$/i.test(file.name)) { setError('Selecciona un archivo .csv.'); return; }
    if (file.size > MAX_FILE_BYTES) { setError('El CSV supera el límite de 5 MB. El archivo no se cargó.'); return; }
    try {
      const bytes = await file.arrayBuffer();
      const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      const foundDelimiter = detectCsvDelimiter(text);
      const nextMatrix = parseDelimitedText(text, delimiter === 'auto' ? foundDelimiter : delimiter);
      if (nextMatrix.length > MAX_ROWS_PER_BATCH + 1) {
        setError(`El archivo contiene más de ${MAX_ROWS_PER_BATCH} filas. No se guardará parcialmente; divide el archivo en lotes menores.`);
        setRows([]); setSourceFile(file); setFileBytes(bytes); setMatrix([]); return;
      }
      const headers = nextMatrix[0] || [];
      const nextMapping = suggestCsvColumnMapping(headers);
      setSourceFile(file); setFileBytes(bytes); setMatrix(nextMatrix); setMapping(nextMapping);
      const mapped = mapCsvRows(nextMatrix, { mapping: nextMapping, dateFormat, numberFormat });
      setRows(mapped.rows);
      setNotice(`Separador detectado: ${foundDelimiter === '\t' ? 'tabulador' : foundDelimiter}. Revisa el mapeo y los formatos antes de analizar.`);
    } catch (fileError) {
      setSourceFile(file); setFileBytes(null); setMatrix([]); setRows([]);
      setError(fileError instanceof TypeError ? `No pudimos leer el archivo: ${fileError.message}` : 'No pudimos leer el archivo con la codificación seleccionada. Prueba UTF-8 o Windows-1252.');
    }
  };

  const handleEncodingChange = async (value) => {
    setEncoding(value);
    if (!fileBytes) return;
    try {
      const text = new TextDecoder(value, { fatal: true }).decode(fileBytes);
      const found = delimiter === 'auto' ? detectCsvDelimiter(text) : delimiter;
      const parsed = parseDelimitedText(text, found);
      setMatrix(parsed);
      const nextMapping = suggestCsvColumnMapping(parsed[0] || []);
      setMapping(nextMapping);
      reparse(parsed, nextMapping);
    } catch { setError('La codificación elegida no coincide con el archivo.'); }
  };

  const handleDelimiterChange = (value) => {
    setDelimiter(value);
    if (!fileBytes) return;
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(fileBytes);
      const parsed = parseDelimitedText(text, value === 'auto' ? detectCsvDelimiter(text) : value);
      setMatrix(parsed);
      const nextMapping = suggestCsvColumnMapping(parsed[0] || []);
      setMapping(nextMapping);
      reparse(parsed, nextMapping);
      setNotice(`Separador en uso: ${value === 'auto' ? 'detectado automáticamente' : value === '\t' ? 'tabulador' : value}.`);
    } catch (parseError) { setError(parseError.message); }
  };

  const selectedAccount = useMemo(() => {
    if (accountChoice === 'other') return { id: '', label: otherAccountName.trim() };
    const card = cards.find((item) => item.id === accountChoice);
    return card ? { id: card.id, label: card.name || card.bank || 'Tarjeta registrada' } : { id: '', label: '' };
  }, [accountChoice, cards, otherAccountName]);

  const eligibleRows = useMemo(() => rows.filter((row) => row.include && row.errors.length === 0 && !excludedRows[row.rowKey]), [rows, excludedRows]);
  const canAnalyze = Boolean(sourceFile && eligibleRows.length > 0 && eligibleRows.length <= MAX_ROWS_PER_BATCH && selectedAccount.label && !analyzing && !saving);

  const makeBatchPayload = useCallback(async (reviewedDuplicateIds = {}) => {
    const canonicalRows = eligibleRows.map((row) => ({
      rowKey: row.rowKey, sourceRow: row.sourceRow, date: row.date, amountMinor: row.amountMinor,
      currency: row.currency, type: row.type, merchant: row.merchant, note: row.note,
      category: row.category, externalId: row.externalId, rawSource: row.rawSource,
    }));
    const fingerprint = await sha256(JSON.stringify({
      source: 'csv', userId: currentUser?.uid, account: selectedAccount, fileName: sourceFile?.name,
      rows: canonicalRows,
    }));
    return {
      batchId: fingerprint,
      fileName: sourceFile.name.slice(0, 120),
      accountId: selectedAccount.id,
      accountLabel: selectedAccount.label,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      rows: canonicalRows,
      reviewedDuplicateIds,
    };
  }, [currentUser?.uid, eligibleRows, selectedAccount, sourceFile]);

  const runAnalysis = async () => {
    setAnalyzing(true); setError(''); setAnalysis(null); setReviewedDuplicates({});
    try {
      const payload = await makeBatchPayload();
      const result = await getCallable('previewCsvImport')(payload);
      setAnalysis({ ...result.data, batchId: payload.batchId, rowsKey: JSON.stringify(eligibleRows.map((row) => [row.rowKey, row.amountMinor, row.date, row.type, row.category])) });
      if (!result.data.complete) setNotice('La búsqueda revisó hasta 5,000 movimientos existentes y no cubre el historial completo. Revisa además el historial antes de confirmar.');
      else setNotice('Análisis listo. Las coincidencias son sugerencias; no se omiten ni se eliminan movimientos automáticamente.');
    } catch (analysisError) { setError(analysisError.message || 'No pudimos analizar el lote. Conservamos los datos para reintentar.'); }
    finally { setAnalyzing(false); }
  };

  const analysisStillCurrent = analysis && analysis.rowsKey === JSON.stringify(eligibleRows.map((row) => [row.rowKey, row.amountMinor, row.date, row.type, row.category]));
  const suggestions = useMemo(() => new Map((analysis?.matches || []).map((match) => [match.rowKey, match.candidates || []])), [analysis]);
  const unreviewedMatches = eligibleRows.some((row) => (suggestions.get(row.rowKey) || []).length > 0 && !reviewedDuplicates[row.rowKey]);

  const handleCorrectRow = (rowKey, changes) => {
    setRows((previous) => previous.map((row) => row.rowKey === rowKey
      ? correctCsvRow(row, changes, { dateFormat, numberFormat })
      : row));
    setAnalysis(null); setReviewedDuplicates({});
  };

  const handleConfirm = async () => {
    if (!analysisStillCurrent || !analysis || unreviewedMatches || !canAnalyze) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const reviewedIds = Object.fromEntries(Object.entries(reviewedDuplicates).map(([key, candidates]) => [key, candidates.map((candidate) => candidate.id)]));
      const payload = await makeBatchPayload(reviewedIds);
      if (payload.batchId !== analysis.batchId) throw new Error('Los datos cambiaron después de la revisión. Analiza de nuevo antes de confirmar.');
      const result = await getCallable('confirmCsvImport')(payload);
      setSavedBatch({ ...result.data, count: result.data.transactionIds?.length || 0, fileName: sourceFile.name });
      setRows([]); setMatrix([]); setAnalysis(null); setReviewedDuplicates({}); setExcludedRows({}); setSourceFile(null); setFileBytes(null);
      await loadHistory();
    } catch (saveError) { setError(saveError.message || 'No pudimos confirmar el lote. Los datos siguen en pantalla para corregir o reintentar.'); }
    finally { setSaving(false); }
  };

  const handleBatchAction = async (batchId, action) => {
    setError(''); setNotice('');
    try {
      const call = getCallable(action === 'undo' ? 'undoCsvImportBatch' : 'restoreCsvImportBatch');
      const result = await call({ batchId });
      setNotice(action === 'undo'
        ? `Importación deshecha: ${result.data.count} movimientos retirados del saldo. Su información original permanece en el historial de importación.`
        : `Importación restaurada: ${result.data.count} movimientos repuestos.`);
      await loadHistory();
    } catch (actionError) { setError(actionError.message || 'No pudimos cambiar el estado del lote. Ningún movimiento se modificó parcialmente.'); }
  };

  const resetForm = () => {
    setSourceFile(null); setFileBytes(null); setMatrix([]); setRows([]); setAnalysis(null); setSavedBatch(null); setError(''); setNotice('');
    setAccountChoice(''); setOtherAccountName(''); setReviewedDuplicates({}); setExcludedRows({});
  };

  return (
    <div className="csv-import-screen min-h-screen bg-[#f7f9f8] pb-40 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <header className="flex items-center gap-3 bg-white px-5 pb-5 pt-7 shadow-sm dark:bg-slate-950">
        <button type="button" onClick={() => navigate('/transactions')} aria-label="Volver a movimientos" className="min-h-11 min-w-11 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">←</button>
        <div><p className="text-sm text-slate-600 dark:text-slate-300">Importar y revisar</p><h1 className="text-xl font-bold">Movimientos desde CSV</h1></div>
      </header>
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-6">
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100" aria-label="Aviso de privacidad">
          El archivo se procesa en este dispositivo. Solo se envían al servidor los movimientos seleccionados para revisar coincidencias o guardar el lote. No envíes documentos que no sean tuyos.
        </section>

        {error && <div role="alert" tabIndex={-1} className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 focus:outline focus:outline-2 focus:outline-red-700 dark:bg-red-950/50 dark:text-red-100">{error}</div>}
        {notice && <div role="status" aria-live="polite" className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:bg-sky-950/40 dark:text-sky-100">{notice}</div>}

        {savedBatch ? (
          <section className="rounded-2xl border border-emerald-300 bg-white p-5 shadow-sm dark:bg-slate-800" role="status" aria-live="polite">
            <h2 className="text-lg font-bold">{savedBatch.duplicate ? 'Este lote ya estaba guardado' : 'Importación confirmada'}</h2>
            <p className="mt-2 text-sm">{savedBatch.count} movimientos confirmados desde {savedBatch.fileName || 'el archivo'}.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => navigate('/transactions')} className="min-h-11 rounded-xl bg-emerald-700 px-4 font-bold text-white">Ver movimientos</button>
              <button type="button" onClick={resetForm} className="min-h-11 rounded-xl border border-slate-300 px-4 font-semibold">Importar otro archivo</button>
            </div>
          </section>
        ) : (
          <>
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5" aria-labelledby="csv-file-title">
              <div><h2 id="csv-file-title" className="font-bold">1. Selecciona el archivo y la cuenta</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">CSV de hasta 5 MB y 100 filas por lote. No se incorporará ningún movimiento hasta confirmar.</p></div>
              <label className="block text-sm font-semibold" htmlFor="csv-account">Cuenta o fuente</label>
              <select id="csv-account" className={fieldStyle} value={accountChoice} onChange={(event) => { setAccountChoice(event.target.value); setAnalysis(null); setReviewedDuplicates({}); }} required>
                <option value="">Selecciona una cuenta o fuente</option>
                {cards.map((card) => <option key={card.id} value={card.id}>{card.name || card.bank || 'Tarjeta'}{card.lastFour ? ` ···· ${card.lastFour}` : ''}</option>)}
                <option value="other">Otra cuenta (escribir nombre)</option>
              </select>
              {accountChoice === 'other' && <label className="block text-sm font-semibold">Nombre de cuenta o fuente
                <input value={otherAccountName} onChange={(event) => { setOtherAccountName(event.target.value); setAnalysis(null); }} maxLength={120} className={`${fieldStyle} mt-1`} placeholder="Ej. cuenta de débito Banco X" required />
              </label>}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold">Codificación
                  <select className={`${fieldStyle} mt-1`} value={encoding} onChange={(event) => handleEncodingChange(event.target.value)}>
                    <option value="utf-8">UTF-8</option><option value="windows-1252">Windows-1252</option><option value="iso-8859-1">ISO-8859-1</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold">Separador de columnas
                  <select className={`${fieldStyle} mt-1`} value={delimiter} onChange={(event) => handleDelimiterChange(event.target.value)}>
                    <option value="auto">Detectar automáticamente</option>{DELIMITER_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-semibold">Archivo CSV
                <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleChooseFile} className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 dark:file:bg-slate-700" />
              </label>
            </section>

            <CaptureSourcePanel />

            {matrix.length > 0 && (
              <>
                <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800" aria-labelledby="csv-format-title">
                  <div><h2 id="csv-format-title" className="font-bold">2. Indica cómo interpretar las columnas</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">La vista previa mostrará el significado de los separadores antes de guardar.</p></div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-semibold">Formato de fecha
                      <select className={`${fieldStyle} mt-1`} value={dateFormat} onChange={(event) => { setDateFormat(event.target.value); reparse(matrix, mapping, event.target.value, numberFormat); }}>
                        <option value="iso">AAAA-MM-DD (ISO)</option><option value="dmy">DD/MM/AAAA</option><option value="mdy">MM/DD/AAAA</option>
                      </select>
                    </label>
                    <label className="block text-sm font-semibold">Formato numérico
                      <select className={`${fieldStyle} mt-1`} value={numberFormat} onChange={(event) => { setNumberFormat(event.target.value); reparse(matrix, mapping, dateFormat, event.target.value); }}>
                        <option value="dot">Punto decimal · 1,234.56</option><option value="comma">Coma decimal · 1.234,56</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {COLUMN_FIELDS.map(([field, label]) => (
                      <label key={field} className="block text-sm font-semibold">{label}
                        <select className={`${fieldStyle} mt-1`} value={mapping[field]} onChange={(event) => {
                          const updated = { ...mapping, [field]: Number(event.target.value) };
                          setMapping(updated); reparse(matrix, updated);
                        }}>
                          <option value={-1}>No mapear</option>
                          {(matrix[0] || []).map((header, index) => <option key={`${field}-${index}`} value={index}>{header || `Columna ${index + 1}`}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">La primera fila se interpreta como encabezados. Puedes mapear una columna de importe o columnas de débito/crédito. Sin columna de tipo, los importes negativos se leen como gastos y los positivos como ingresos; verifica esa interpretación. La moneda DOP se conserva; otras monedas quedan como error hasta que exista conversión explícita. Las transferencias no se convierten en ingresos o gastos.</p>
                </section>

                <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5" aria-labelledby="csv-review-title">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 id="csv-review-title" className="font-bold">3. Revisa y corrige el lote</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{eligibleRows.length} filas seleccionadas · {rows.filter((row) => row.errors.length > 0).length} con errores · no se guarda parcialmente.</p></div>
                    <button type="button" onClick={runAnalysis} disabled={!canAnalyze} className="min-h-11 rounded-xl border border-emerald-700 px-4 font-semibold text-emerald-900 disabled:opacity-50 dark:text-emerald-100">{analyzing ? 'Analizando…' : 'Buscar posibles duplicados'}</button>
                  </div>
                  <div className="space-y-3">
                    {rows.map((row) => {
                      const candidates = suggestions.get(row.rowKey) || [];
                      const selected = row.include && !excludedRows[row.rowKey];
                      return (
                        <article key={row.rowKey} className={`rounded-xl border p-3 ${row.errors.length ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : candidates.length ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
                          <div className="flex items-start gap-3">
                            <input type="checkbox" checked={selected} disabled={row.errors.length > 0} onChange={(event) => { setExcludedRows((prev) => ({ ...prev, [row.rowKey]: !event.target.checked })); setAnalysis(null); }} aria-label={`Incluir fila ${row.sourceRow}`} className="mt-1 h-5 w-5 rounded border-slate-400 text-emerald-700 focus:ring-emerald-700" />
                            <div className="min-w-0 flex-1">
                              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Borrador · fila {row.sourceRow}{candidates.length > 0 ? ' · posible coincidencia' : ''}</p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <label className="text-xs font-semibold">Fecha
                                  <input value={row.rawDate} onChange={(event) => handleCorrectRow(row.rowKey, { rawDate: event.target.value })} className={`${fieldStyle} mt-1`} aria-label={`Fecha fila ${row.sourceRow}`} />
                                </label>
                                <label className="text-xs font-semibold">Importe (DOP)
                                  <input inputMode="decimal" value={row.rawAmount} onChange={(event) => handleCorrectRow(row.rowKey, { rawAmount: event.target.value })} className={`${fieldStyle} mt-1`} aria-label={`Importe fila ${row.sourceRow}`} />
                                </label>
                                <label className="text-xs font-semibold">Tipo
                                  <select value={normalizeCsvHeader(row.rawType)} onChange={(event) => handleCorrectRow(row.rowKey, { rawType: event.target.value })} className={`${fieldStyle} mt-1`} aria-label={`Tipo fila ${row.sourceRow}`}>
                                    <option value="gasto">Gasto</option><option value="ingreso">Ingreso</option><option value="transferencia">Transferencia (no importar)</option>
                                  </select>
                                </label>
                                <label className="text-xs font-semibold">Moneda
                                  <select value={row.currency} onChange={(event) => handleCorrectRow(row.rowKey, { rawCurrency: event.target.value })} className={`${fieldStyle} mt-1`} aria-label={`Moneda fila ${row.sourceRow}`}>
                                    <option value="DOP">DOP · peso dominicano</option><option value="USD">USD · dólar</option>
                                  </select>
                                </label>
                                <label className="text-xs font-semibold">Categoría
                                  <input value={row.category} onChange={(event) => { handleCorrectRow(row.rowKey, { category: event.target.value }); }} className={`${fieldStyle} mt-1`} aria-label={`Categoría fila ${row.sourceRow}`} />
                                </label>
                                <label className="text-xs font-semibold sm:col-span-2">Comercio o descripción
                                  <input value={row.merchant} onChange={(event) => handleCorrectRow(row.rowKey, { merchant: event.target.value })} maxLength={120} className={`${fieldStyle} mt-1`} aria-label={`Comercio fila ${row.sourceRow}`} />
                                </label>
                              </div>
                              <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">{row.date ? `${row.date} · ` : ''}{row.amountMinor ? formatDop(row.amountMinor) : 'Importe por corregir'} · {row.type === 'income' ? 'Ingreso' : row.type === 'expense' ? 'Gasto' : 'Tipo pendiente'}</p>
                              {row.errors.map((message) => <p key={message} className="mt-1 text-sm font-semibold text-red-800 dark:text-red-200">Fila {row.sourceRow}: {message}</p>)}
                              {analysisStillCurrent && candidates.length > 0 && <div className="mt-2 rounded-lg border border-amber-300 p-3 text-sm" role="group" aria-label={`Posibles duplicados de la fila ${row.sourceRow}`}>
                                <p className="font-bold">Posible coincidencia — revisa antes de continuar:</p>
                                {candidates.map((candidate) => <p key={candidate.id} className="mt-1">{candidate.date} · {formatDop(candidate.amountMinor)} · {candidate.label}{candidate.exactExternalId ? ' · mismo identificador externo' : ' · coincidencia aproximada'}</p>)}
                                <label className="mt-2 flex items-start gap-2 font-medium"><input type="checkbox" checked={Boolean(reviewedDuplicates[row.rowKey])} onChange={(event) => setReviewedDuplicates((prev) => ({ ...prev, [row.rowKey]: event.target.checked ? candidates : undefined }))} className="mt-1 h-4 w-4" />Revisé la coincidencia; deseo incluir esta fila de todos modos.</label>
                              </div>}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {analysisStillCurrent && analysis.matches?.some((item) => item.candidates.length) && <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Confirma solo las filas cuya coincidencia hayas revisado. Puedes excluir una fila para no incorporarla.</p>}
                  <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900">
                    <p><strong>Resumen:</strong> {eligibleRows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + (row.amountMinor || 0), 0) ? `Gastos ${formatDop(eligibleRows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + (row.amountMinor || 0), 0))}` : 'Sin gastos'} · {eligibleRows.filter((row) => row.type === 'income').reduce((sum, row) => sum + (row.amountMinor || 0), 0) ? `Ingresos ${formatDop(eligibleRows.filter((row) => row.type === 'income').reduce((sum, row) => sum + (row.amountMinor || 0), 0))}` : 'Sin ingresos'}</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Se incorporarán exactamente {eligibleRows.length} filas válidas marcadas. Filas excluidas: {rows.length - eligibleRows.length}.</p>
                  </div>
                  <button type="button" onClick={handleConfirm} disabled={!analysisStillCurrent || !analysis?.complete || unreviewedMatches || !canAnalyze || eligibleRows.length === 0} className="min-h-12 w-full rounded-xl bg-emerald-700 px-4 font-bold text-white disabled:opacity-50">{saving ? 'Guardando lote…' : `Confirmar ${eligibleRows.length} movimientos`}</button>
                  {!analysisStillCurrent && <p className="text-center text-xs text-slate-600 dark:text-slate-300">Analiza el lote para revisar posibles coincidencias antes de confirmar.</p>}
                  {analysisStillCurrent && !analysis.complete && <p role="alert" className="text-center text-sm font-semibold text-red-800 dark:text-red-200">No se puede confirmar: el historial supera el límite de análisis seguro. Reduce el lote o consulta el historial.</p>}
                </section>
              </>
            )}

            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800" aria-labelledby="csv-history-title">
              <div className="flex items-center justify-between gap-2"><div><h2 id="csv-history-title" className="font-bold">Historial de importaciones</h2><p className="text-sm text-slate-600 dark:text-slate-300">Puedes deshacer o restaurar un lote; sus filas originales permanecen en el historial.</p></div><button type="button" onClick={loadHistory} disabled={historyBusy} className="min-h-10 rounded-lg px-3 text-sm font-semibold underline">Actualizar</button></div>
              {historyBusy ? <p role="status" className="text-sm">Cargando importaciones…</p> : history.length === 0 ? <p className="text-sm text-slate-500">Todavía no hay lotes importados.</p> : history.map((batch) => (
                <article key={batch.batchId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div><p className="font-semibold">{batch.fileName} · {batch.accountLabel}</p><p className="text-sm text-slate-600 dark:text-slate-300">{batch.rowCount} movimientos · {batch.status === 'posted' ? 'Contabilizado' : 'Deshecho'}{batch.createdAt ? ` · ${new Date(batch.createdAt).toLocaleString()}` : ''}</p></div>
                  {batch.status === 'posted' ? <button type="button" onClick={() => handleBatchAction(batch.batchId, 'undo')} className="min-h-10 rounded-lg border border-amber-600 px-3 text-sm font-semibold text-amber-900 dark:text-amber-200">Deshacer lote</button> : <button type="button" onClick={() => handleBatchAction(batch.batchId, 'restore')} className="min-h-10 rounded-lg border border-emerald-700 px-3 text-sm font-semibold">Restaurar lote</button>}
                </article>
              ))}
            </section>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
