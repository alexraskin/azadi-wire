import { describe, it, expect } from 'vitest';
import { slugify, TOPICS, TOPIC_LABELS } from './types';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Nuclear Talks Resume In Vienna')).toBe('nuclear-talks-resume-in-vienna');
  });

  it('folds accents to ASCII', () => {
    expect(slugify('Café Tehran')).toBe('cafe-tehran');
  });

  it('collapses runs of punctuation into a single hyphen', () => {
    expect(slugify('Iran -- U.S. talks: what now?')).toBe('iran-u-s-talks-what-now');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('!!! Breaking !!!')).toBe('breaking');
  });

  it('drops characters with no ASCII equivalent', () => {
    expect(slugify('تهران protests')).toBe('protests');
  });

  it('caps length at 80 characters', () => {
    const slug = slugify('word '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(80);
  });

  it('can leave a trailing hyphen when the 80-char cut lands on a separator', () => {
    // Truncation happens after trimming, so the cut can re-expose a hyphen.
    const slug = slugify(`${'a'.repeat(79)} extra`);
    expect(slug).toBe(`${'a'.repeat(79)}-`);
  });

  it('returns an empty string when nothing survives', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('topic constants', () => {
  it('has a label for every topic', () => {
    for (const topic of TOPICS) {
      expect(TOPIC_LABELS[topic]).toBeTruthy();
    }
  });

  it('has no labels for unknown topics', () => {
    expect(Object.keys(TOPIC_LABELS).sort()).toEqual([...TOPICS].sort());
  });
});
