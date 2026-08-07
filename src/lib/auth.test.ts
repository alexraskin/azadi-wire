import { describe, it, expect } from 'vitest';
import { checkBearerAuth } from './auth';

const SECRET = 'super-secret-cron-token';

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://azadiwire.org/api/cron', { headers });
}

describe('checkBearerAuth', () => {
  it('accepts a matching bearer token', () => {
    expect(checkBearerAuth(req({ authorization: `Bearer ${SECRET}` }), SECRET)).toBe(true);
  });

  it('rejects a wrong token of the same length', () => {
    const wrong = 'x'.repeat(SECRET.length);
    expect(checkBearerAuth(req({ authorization: `Bearer ${wrong}` }), SECRET)).toBe(false);
  });

  it('rejects a token of a different length without throwing', () => {
    expect(checkBearerAuth(req({ authorization: 'Bearer short' }), SECRET)).toBe(false);
  });

  it('rejects when the secret is unset', () => {
    expect(checkBearerAuth(req({ authorization: `Bearer ${SECRET}` }), undefined)).toBe(false);
    expect(checkBearerAuth(req({ authorization: 'Bearer ' }), '')).toBe(false);
  });

  it('rejects a missing Authorization header', () => {
    expect(checkBearerAuth(req(), SECRET)).toBe(false);
  });

  it('rejects a non-Bearer scheme carrying the right secret', () => {
    expect(checkBearerAuth(req({ authorization: `Basic ${SECRET}` }), SECRET)).toBe(false);
    expect(checkBearerAuth(req({ authorization: SECRET }), SECRET)).toBe(false);
  });

  it('is case-sensitive on the scheme', () => {
    expect(checkBearerAuth(req({ authorization: `bearer ${SECRET}` }), SECRET)).toBe(false);
  });

  it('does not trim whitespace around the token', () => {
    expect(checkBearerAuth(req({ authorization: `Bearer  ${SECRET}` }), SECRET)).toBe(false);
  });

  it('rejects an empty token after the scheme', () => {
    expect(checkBearerAuth(req({ authorization: 'Bearer ' }), SECRET)).toBe(false);
  });
});
