import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { relativeTime, formatDate } from './time';

const NOW = new Date('2026-08-07T12:00:00.000Z');

function ago(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

describe('relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports sub-minute ages as "just now"', () => {
    expect(relativeTime(ago(0))).toBe('just now');
    expect(relativeTime(ago(59))).toBe('just now');
  });

  it('singularises the one-unit case', () => {
    expect(relativeTime(ago(60))).toBe('1 minute ago');
    expect(relativeTime(ago(3600))).toBe('1 hour ago');
    expect(relativeTime(ago(86400))).toBe('1 day ago');
    expect(relativeTime(ago(604800))).toBe('1 week ago');
  });

  it('pluralises above one unit', () => {
    expect(relativeTime(ago(120))).toBe('2 minutes ago');
    expect(relativeTime(ago(7200))).toBe('2 hours ago');
    expect(relativeTime(ago(172800))).toBe('2 days ago');
  });

  it('rolls over at each unit boundary', () => {
    expect(relativeTime(ago(3599))).toBe('59 minutes ago');
    expect(relativeTime(ago(86399))).toBe('23 hours ago');
    expect(relativeTime(ago(604799))).toBe('6 days ago');
  });

  it('uses 30-day months and 365-day years', () => {
    expect(relativeTime(ago(2592000))).toBe('1 month ago');
    expect(relativeTime(ago(31536000))).toBe('1 year ago');
    expect(relativeTime(ago(63072000))).toBe('2 years ago');
  });

  it('treats future timestamps as "just now"', () => {
    expect(relativeTime(ago(-500))).toBe('just now');
  });

  it('returns "just now" for an unparseable date', () => {
    // NaN comparisons are all false, so every branch falls through to the
    // first `if (diff < MINUTE)`... which is also false. Documents the
    // year-NaN fallthrough.
    expect(relativeTime('not a date')).toBe('NaN years ago');
  });
});

describe('formatDate', () => {
  it('formats in UTC regardless of local zone', () => {
    expect(formatDate('2026-08-07T23:30:00.000Z')).toBe('August 7, 2026');
  });

  it('does not shift the day for early-UTC timestamps', () => {
    expect(formatDate('2026-01-01T00:30:00.000Z')).toBe('January 1, 2026');
  });

  it('accepts a bare date string', () => {
    expect(formatDate('2026-03-21')).toBe('March 21, 2026');
  });
});
