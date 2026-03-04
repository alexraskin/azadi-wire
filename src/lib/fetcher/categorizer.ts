import type { Topic } from '../types';
import { TOPICS } from '../types';

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
  'You are a news article classifier. Given an article title and summary about Iran, ' +
  'classify it into exactly one topic. Respond with only the topic name, nothing else.';

function buildUserPrompt(title: string, summary: string | null): string {
  const topicList = TOPICS.filter((t) => t !== 'general').join(', ');
  let prompt = `Topics: ${topicList}, general\n\nTitle: ${title}`;
  if (summary) prompt += `\nSummary: ${summary}`;
  return prompt;
}

function parseAIResponse(raw: string): Topic | null {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z_]/g, '');
  if ((TOPICS as string[]).includes(cleaned)) return cleaned as Topic;
  for (const topic of TOPICS) {
    if (raw.toLowerCase().includes(topic)) return topic;
  }
  return null;
}

export async function categorize(
  title: string,
  summary: string | null,
  ai?: any,
): Promise<Topic> {
  if (ai) {
    try {
      const response = await ai.run('workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(title, summary) },
        ],
        max_tokens: 20,
      }, {
        gateway: { id: 'azadiwire' },
      });
      const topic = parseAIResponse(response.response ?? '');
      if (topic) return topic;
    } catch {
      // AI unavailable — fall through to keyword matching
    }
  }

  return categorizeByKeywords(title, summary);
}
