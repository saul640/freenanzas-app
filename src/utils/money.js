export const parseDopToMinorUnits = (rawValue) => {
  const value = String(rawValue ?? '').trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;

  const [whole, fraction = ''] = value.replace(',', '.').split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
};

export const formatDopFromMinorUnits = (minor) => (minor / 100).toFixed(2);
