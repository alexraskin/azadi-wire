import { describe, it, expect } from 'vitest';
import { normalizeTitle, similarity, isDuplicate } from './dedup';

describe('normalizeTitle', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeTitle('  Iran’s  "Nuclear" Talks: Round 3!  ')).toBe(
      'irans nuclear talks round 3'
    );
  });

  it('keeps underscores and digits (\\w class)', () => {
    expect(normalizeTitle('IAEA_report 2026')).toBe('iaea_report 2026');
  });

  it('strips non-ASCII letters along with punctuation', () => {
    // [^\w\s] removes accented and Persian characters, not just punctuation
    expect(normalizeTitle('Café Tehran')).toBe('caf tehran');
  });
});

describe('similarity', () => {
  it('returns 1 for titles that normalize to the same string', () => {
    expect(similarity('Protests in Tehran', 'protests in tehran!!')).toBe(1);
  });

  it('returns 0 for fully disjoint titles', () => {
    expect(similarity('nuclear talks resume', 'film festival opens')).toBe(0);
  });

  it('scores partial word overlap against the longer title', () => {
    // 3 of 4 words match, longer side has 4 distinct words
    expect(similarity('protests spread across Iran', 'protests spread across Tehran')).toBeCloseTo(
      0.75
    );
  });

  it('is asymmetric when one title repeats words', () => {
    // wordsA is an array (duplicates counted), wordsB is a Set (deduped),
    // so argument order changes the score.
    expect(similarity('iran iran talks nuclear', 'iran talks')).toBeCloseTo(0.75);
    expect(similarity('iran talks', 'iran iran talks nuclear')).toBeCloseTo(2 / 3);
  });

  it('scores a repeated-word title as a perfect match (known quirk)', () => {
    // Every repeat counts as a hit while the Set caps `total`, so padding a
    // title with duplicates can reach 1.0 against a shorter one.
    expect(similarity('iran iran iran talks', 'iran talks')).toBe(1);
  });

  it('handles empty input without dividing by zero', () => {
    expect(similarity('', '')).toBe(1);
    expect(similarity('tehran', '')).toBe(0);
  });
});

describe('isDuplicate', () => {
  const existing = [
    'IRGC commander killed in airstrike',
    'Nuclear talks resume in Vienna',
  ];

  it('flags a near-identical restatement at the default 0.9 threshold', () => {
    expect(isDuplicate('IRGC commander killed in airstrike.', existing)).toBe(true);
  });

  it('does not flag a distinct headline', () => {
    expect(isDuplicate('Film festival opens in Tehran', existing)).toBe(false);
  });

  it('does not flag a partial overlap below threshold', () => {
    expect(isDuplicate('Nuclear talks collapse in Geneva', existing)).toBe(false);
  });

  it('honours a lowered threshold', () => {
    expect(isDuplicate('Nuclear talks resume in Geneva', existing, 0.7)).toBe(true);
  });

  it('returns false against an empty corpus', () => {
    expect(isDuplicate('anything', [])).toBe(false);
  });
});
