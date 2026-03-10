import type { Topic } from '../types';
import { TOPICS } from '../types';

export interface CategorizeResult {
  topic: Topic;
  importance: number | null;
}

const KEYWORD_MAP: Record<Exclude<Topic, 'general'>, string[]> = {
  war: [
    'war', 'airstrike', 'airstrikes', 'bombing', 'missile strike', 'military strike',
    'military operation', 'invasion', 'casualties', 'killed', 'wounded', 'shelling',
    'bombardment', 'ceasefire', 'conflict', 'combat', 'drone strike', 'warplane',
    'troops', 'ground offensive', 'retaliation', 'true promise', 'escalation',
    'civilian casualties', 'martyr', 'martyred', 'defense ministry',
  ],
  human_rights: [
    'prisoner', 'execution', 'detained', 'irgc', 'crackdown', 'torture',
    'political prisoner', 'evin', 'arbitrary arrest', 'flogging', 'death sentence',
  ],
  politics: [
    'parliament', 'majlis', 'supreme leader', 'khamenei', 'raisi', 'pezeshkian',
    'reformist', 'hardliner', 'guardian council', 'election',
  ],
  culture: [
    'film', 'cinema', 'music', 'art', 'festival', 'persian', 'nowruz',
    'literature', 'poet', 'calligraphy',
  ],
  protests: [
    'protest', 'demonstration', 'rally', 'strike', 'woman life freedom',
    'mahsa', 'unrest', 'uprising', 'dissent',
  ],
  sanctions: [
    'sanction', 'jcpoa', 'nuclear', 'enrichment', 'iaea', 'oil embargo',
    'trade restriction', 'treasury department',
  ],
};

function categorizeByKeywords(title: string, summary: string | null): Topic {
  const text = `${title} ${summary || ''}`.toLowerCase();
  let bestTopic: Topic = 'general';
  let bestCount = 0;

  for (const [topic, keywords] of Object.entries(KEYWORD_MAP)) {
    let count = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestTopic = topic as Topic;
    }
  }

  return bestTopic;
}

const SYSTEM_PROMPT =
  'You are a news article classifier and importance rater for Iran-related news. ' +
  'Given an article title and optional summary, respond with JSON containing exactly two fields:\n' +
  '1. "topic": one of the allowed topic values\n' +
  '2. "importance": an integer from 1 to 10 rating newsworthiness ' +
  '(10 = major breaking news or historic event, 7-9 = significant development, ' +
  '4-6 = notable story, 1-3 = routine or minor news)\n\n' +
  'Respond with ONLY valid JSON, no other text.';

function buildUserPrompt(title: string, summary: string | null): string {
  const topicList = TOPICS.filter((t) => t !== 'general').join(', ');
  let prompt = `Topics: ${topicList}, general\n\nTitle: ${title}`;
  if (summary) prompt += `\nSummary: ${summary}`;
  return prompt;
}

function parseAIResponse(raw: string): CategorizeResult | null {
  const text = raw.trim();

  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const topic = parseTopic(parsed.topic);
      const importance = parseImportance(parsed.importance);
      if (topic) return { topic, importance };
    } catch { /* fall through */ }
  }

  const topic = parseTopic(text);
  if (topic) return { topic, importance: null };

  return null;
}

function parseTopic(raw: unknown): Topic | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z_]/g, '');
  if ((TOPICS as string[]).includes(cleaned)) return cleaned as Topic;
  for (const topic of TOPICS) {
    if (raw.toLowerCase().includes(topic)) return topic;
  }
  return null;
}

function parseImportance(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (Number.isFinite(n) && n >= 1 && n <= 10) return Math.round(n);
  return null;
}

export async function categorize(
  title: string,
  summary: string | null,
  ai?: any,
): Promise<CategorizeResult> {
  if (ai) {
    try {
      const response = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(title, summary) },
        ],
        max_tokens: 50,
      }, {
        gateway: { id: 'azadiwire' },
      });
      const result = parseAIResponse(response.response ?? '');
      if (result) return result;
    } catch (err) {
      console.error('AI unavailable', err);
    }
  }

  return { topic: categorizeByKeywords(title, summary), importance: null };
}
