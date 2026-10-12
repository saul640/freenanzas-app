import { describe, expect, it } from 'vitest';
import { getTransactionCalendarParts } from './date';

describe('getTransactionCalendarParts', () => {
  it('uses the entered local calendar date instead of the server timestamp month', () => {
    expect(getTransactionCalendarParts({ date: '2026-10-31', timestamp: new Date('2026-11-01T03:00:00Z') }))
      .toEqual({ year: 2026, month: 9 });
  });

  it('rejects impossible calendar dates and falls back to a valid timestamp', () => {
    expect(getTransactionCalendarParts({ date: '2026-02-30', timestamp: new Date('2026-10-11T12:00:00') }))
      .toEqual({ year: 2026, month: 9 });
  });
});
