import { describe, it, expect, vi } from 'vitest';
import { categorize } from './categorizer';

/** Minimal stand-in for the Workers AI binding. */
function fakeAI(response: unknown) {
  return { run: vi.fn().mockResolvedValue({ response }) };
}

function failingAI(err: unknown = new Error('AI down')) {
  return { run: vi.fn().mockRejectedValue(err) };
}

describe('categorize — AI path', () => {
  it('parses a clean JSON response', async () => {
    const ai = fakeAI('{"topic":"war","importance":9}');
    await expect(categorize('Airstrike hits Isfahan', null, ai)).resolves.toEqual({
      topic: 'war',
      importance: 9,
    });
  });

  it('accepts an object response without JSON string parsing', async () => {
    const ai = fakeAI({ topic: 'sanctions', importance: 4 });
    await expect(categorize('New Treasury listing', null, ai)).resolves.toEqual({
      topic: 'sanctions',
      importance: 4,
    });
  });

  it('digs JSON out of surrounding prose', async () => {
    const ai = fakeAI('Sure! Here is the result:\n{"topic":"politics","importance":6}\nHope that helps.');
    await expect(categorize('Majlis vote scheduled', null, ai)).resolves.toEqual({
      topic: 'politics',
      importance: 6,
    });
  });

  it('accepts a bare topic word with no importance', async () => {
    const ai = fakeAI('protests');
    await expect(categorize('Rally in Shiraz', null, ai)).resolves.toEqual({
      topic: 'protests',
      importance: null,
    });
  });

  it('coerces a numeric-string importance', async () => {
    const ai = fakeAI('{"topic":"culture","importance":"7"}');
    await expect(categorize('Nowruz film festival', null, ai)).resolves.toEqual({
      topic: 'culture',
      importance: 7,
    });
  });

  it('rounds a fractional importance', async () => {
    const ai = fakeAI('{"topic":"culture","importance":6.6}');
    await expect(categorize('Poetry night', null, ai)).resolves.toMatchObject({ importance: 7 });
  });

  it('nulls an out-of-range importance but keeps the topic', async () => {
    const ai = fakeAI('{"topic":"war","importance":99}');
    await expect(categorize('Missile strike', null, ai)).resolves.toEqual({
      topic: 'war',
      importance: null,
    });
  });

  it('sends the article title and summary in the prompt', async () => {
    const ai = fakeAI('{"topic":"general","importance":3}');
    await categorize('Some title', 'Some summary', ai);
    const [, body] = ai.run.mock.calls[0];
    expect(body.messages[1].content).toContain('Some title');
    expect(body.messages[1].content).toContain('Some summary');
  });

  it('routes through the azadiwire AI gateway', async () => {
    const ai = fakeAI('{"topic":"general","importance":3}');
    await categorize('Some title', null, ai);
    const [, , opts] = ai.run.mock.calls[0];
    expect(opts).toEqual({ gateway: { id: 'azadiwire' } });
  });
});

describe('categorize — keyword fallback', () => {
  it('falls back when no AI binding is supplied', async () => {
    await expect(categorize('Protest rally over unrest', null)).resolves.toEqual({
      topic: 'protests',
      importance: null,
    });
  });

  it('falls back when the AI call throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ai = failingAI();
    await expect(categorize('Political prisoner executed in Evin', null, ai)).resolves.toEqual({
      topic: 'human_rights',
      importance: null,
    });
  });

  it('falls back when the AI returns an unusable topic', async () => {
    const ai = fakeAI('{"topic":"sportsball","importance":5}');
    await expect(categorize('IAEA enrichment report', null, ai)).resolves.toEqual({
      topic: 'sanctions',
      importance: null,
    });
  });

  it('matches keywords in the summary as well as the title', async () => {
    const result = await categorize('Untitled update', 'The airstrike caused civilian casualties');
    expect(result.topic).toBe('war');
  });

  it('defaults to general when nothing matches', async () => {
    await expect(categorize('Weather report for Tuesday', null)).resolves.toEqual({
      topic: 'general',
      importance: null,
    });
  });

  it('picks the topic with the most keyword hits', async () => {
    const result = await categorize(
      'Khamenei addresses parliament as majlis debates election law',
      null
    );
    expect(result.topic).toBe('politics');
  });
});
