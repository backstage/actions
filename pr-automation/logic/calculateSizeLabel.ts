export const SIZE_LABELS: Array<{ label: string; threshold: number }> = [
  { label: 'size:tiny', threshold: 5 },
  { label: 'size:small', threshold: 50 },
  { label: 'size:medium', threshold: 500 },
  { label: 'size:large', threshold: 2500 },
  { label: 'size:huge', threshold: Number.POSITIVE_INFINITY },
];

export function calculateSizeLabel(additions: number): string {
  const match = SIZE_LABELS.find(({ threshold }) => additions <= threshold);
  if (!match) {
    throw new Error(`No size label configured for ${additions} additions`);
  }
  return match.label;
}
