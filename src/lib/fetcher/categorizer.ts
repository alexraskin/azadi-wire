import type { Topic } from '../types';

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

export function categorize(title: string, summary: string | null): Topic {
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
