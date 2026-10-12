import { describe, expect, it } from 'vitest';
import { formatDopFromMinorUnits, parseDopToMinorUnits } from './money';

describe('DOP amount parsing', () => {
  it('accepts either decimal separator and preserves exact cents', () => {
    expect(parseDopToMinorUnits('12.34')).toBe(1234);
    expect(parseDopToMinorUnits('12,3')).toBe(1230);
    expect(parseDopToMinorUnits('12,34')).toBe(1234);
    expect(formatDopFromMinorUnits(1234)).toBe('12.34');
  });

  it.each(['', '0', '0.00', '-1', '1,234', '1.234,56', '1,2,3', '1e3', ' 1 000 '])(
    'rejects ambiguous or invalid amount %s',
    (value) => expect(parseDopToMinorUnits(value)).toBeNull(),
  );
});
