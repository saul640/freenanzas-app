export const createCaptureDraft = (source, date = new Date().toISOString().slice(0, 10)) => {
  if (!['photo-simulation', 'voice-simulation'].includes(source)) throw new TypeError('Fuente de captura no admitida.');
  return {
    type: 'expense',
    amount: '',
    date,
    category: 'Sin clasificar',
    note: '',
    merchant: '',
    captureSource: source,
    captureStatus: 'draft',
    recognitionStatus: 'not-connected',
  };
};

export const getCaptureDisclosure = (source) => {
  if (source === 'photo-simulation') return 'La captura de foto está simulada: no hay OCR ni se envía la imagen. Completa y confirma los datos manualmente.';
  if (source === 'voice-simulation') return 'La captura de voz está simulada: el audio no se transcribe ni sale del dispositivo. Completa y confirma los datos manualmente.';
  return 'Revisa y confirma manualmente los datos antes de guardarlos.';
};
