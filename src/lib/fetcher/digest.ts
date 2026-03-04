import type { Article, DailyDigest, Topic } from '../types';
import { TOPIC_LABELS, TOPICS } from '../types';
import { digestExistsForDate, getLast24hArticles, insertDigest } from '../db';

const SYSTEM_PROMPT =
  'You are a news editor summarising the day\'s Iran-related news. ' +
  'Given a list of article headlines and summaries, produce a JSON object with two keys:\n' +
  '1. "overall": a 3-5 sentence summary of the most important developments.\n' +
  '2. "topics": an object where each key is one of the provided topic names and the value ' +
  'is a 1-3 sentence summary for that topic. Only include topics that have articles.\n' +
  'Respond with ONLY valid JSON, no markdown fences or extra text.';

function buildArticleList(articles: Article[]): string {
  return articles
    .map((a, i) => {
      const summary = a.summary ? a.summary.slice(0, 150) : '';
      return `${i + 1}. [${TOPIC_LABELS[a.topic as Topic] || a.topic}] ${a.title}${summary ? ' — ' + summary : ''}`;
    })
    .join('\n');
}

function buildUserPrompt(articles: Article[]): string {
  const topicSet = new Set(articles.map((a) => a.topic));
  const activeTopics = TOPICS.filter((t) => topicSet.has(t))
    .map((t) => `${t} (${TOPIC_LABELS[t]})`)
    .join(', ');

  return (
    `Today's articles (${articles.length} total):\n\n` +
    buildArticleList(articles) +
    `\n\nActive topics: ${activeTopics}\n\nProduce the JSON summary.`
  );
}

interface DigestResponse {
  overall: string;
  topics: Record<string, string>;
}

function parseAIResponse(raw: string): DigestResponse | null {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.overall === 'string' && typeof parsed.topics === 'object') {
      return parsed as DigestResponse;
    }
  } catch {
    // Try to extract JSON from the response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed.overall === 'string' && typeof parsed.topics === 'object') {
          return parsed as DigestResponse;
        }
      } catch {
        // fall through to fallback
      }
    }
  }
  return null;
}

function buildFallbackDigest(articles: Article[]): DigestResponse {
  const byTopic: Record<string, Article[]> = {};
  for (const a of articles) {
    if (!byTopic[a.topic]) byTopic[a.topic] = [];
    byTopic[a.topic].push(a);
  }

  const topHeadlines = articles.slice(0, 5).map((a) => a.title).join('. ');
  const overall = `Today's ${articles.length} articles cover: ${topHeadlines}.`;

  const topics: Record<string, string> = {};
  for (const [topic, topicArticles] of Object.entries(byTopic)) {
    const label = TOPIC_LABELS[topic as Topic] || topic;
    const headlines = topicArticles.slice(0, 3).map((a) => a.title).join('; ');
    topics[topic] = `${topicArticles.length} ${label} article${topicArticles.length > 1 ? 's' : ''}: ${headlines}.`;
  }

  return { overall, topics };
}

const MIN_ARTICLES_FOR_DIGEST = 3;

export async function maybeGenerateDigest(db: any, ai?: any): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);

  const exists = await digestExistsForDate(db, today);
  if (exists) return false;

  const articles = await getLast24hArticles(db);
  if (articles.length < MIN_ARTICLES_FOR_DIGEST) return false;

  let response: DigestResponse;

  if (ai) {
    try {
      const aiResult = await ai.run(
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        {
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(articles) },
          ],
          max_tokens: 1024,
        },
        { gateway: { id: 'azadiwire' } }
      );
      const parsed = parseAIResponse(aiResult.response ?? '');
      response = parsed || buildFallbackDigest(articles);
    } catch (err) {
      console.error('Digest AI call failed, using fallback', err);
      response = buildFallbackDigest(articles);
    }
  } else {
    response = buildFallbackDigest(articles);
  }

  const digest: DailyDigest = {
    id: crypto.randomUUID(),
    digest_date: today,
    overall_summary: response.overall,
    topic_summaries: JSON.stringify(response.topics),
    article_count: articles.length,
    created_at: new Date().toISOString(),
  };

  await insertDigest(db, digest);
  return true;
}
