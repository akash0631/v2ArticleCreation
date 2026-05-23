export const formatDivisionLabel = (value?: string | null): string => {
  const raw = String(value || '').trim();
  const normalized = raw.toUpperCase();

  if (normalized === 'MEN' || normalized === 'MENS') return 'MENS';
  if (normalized === 'LADIES' || normalized === 'LADY') return 'LADIES';
  if (normalized === 'KIDS' || normalized === 'KID') return 'KIDS';

  return raw;
};
