export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function similarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return 1;

  const wordsA = na.split(' ');
  const wordsB = new Set(nb.split(' '));
  const total = Math.max(wordsA.length, wordsB.size);
  if (total === 0) return 1;

  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) matches++;
  }
  return matches / total;
}

export function isDuplicate(
  title: string,
  existingTitles: string[],
  threshold: number = 0.9
): boolean {
  for (const existing of existingTitles) {
    if (similarity(title, existing) >= threshold) return true;
  }
  return false;
}
