import { describe, expect, it } from 'vitest';
import { createCaptureDraft, getCaptureDisclosure } from './captureDraftAdapter';

describe('adaptadores simulados de captura', () => {
  it('crea un borrador vacío para revisión manual sin inventar campos', () => {
    const draft = createCaptureDraft('photo-simulation', '2026-10-11');
    expect(draft).toMatchObject({ type: 'expense', amount: '', date: '2026-10-11', category: 'Sin clasificar', captureStatus: 'draft', recognitionStatus: 'not-connected' });
    expect(draft.merchant).toBe('');
    expect(getCaptureDisclosure('photo-simulation')).toMatch(/no hay OCR/i);
  });

  it('documenta que voz no implica una transcripción real', () => {
    expect(getCaptureDisclosure('voice-simulation')).toMatch(/no se transcribe/i);
    expect(() => createCaptureDraft('bank')).toThrow();
  });
});
