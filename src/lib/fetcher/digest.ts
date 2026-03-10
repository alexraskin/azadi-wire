import type { Article, DailyDigest, Topic } from '../types';
import { TOPIC_LABELS, TOPICS } from '../types';
import { digestExistsForDate, getTodayArticles, getTopArticles, insertDigest } from '../db';
import { getResendClient, type ResendEnv } from '../resend';

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function buildTopArticlesHtml(articles: Article[]): string {
  if (articles.length === 0) return '';

  let rows = '';
  for (const a of articles) {
    const label = TOPIC_LABELS[a.topic as Topic] || a.topic;
    const url = `https://azadiwire.org/article/${a.slug || a.id}`;
    rows += `<tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0">` +
      `<a href="${url}" style="color:#111;font-weight:600;text-decoration:none">${a.title}</a>` +
      `<br><span style="font-size:12px;color:#999">${a.source_name} &middot; ${label}</span>` +
      `</td></tr>`;
  }

  return `<div style="margin:20px 0;padding:16px;background:#f9f9f9;border-left:3px solid #111">` +
    `<h3 style="margin:0 0 8px;font-size:15px">Top Stories</h3>` +
    `<table style="width:100%;border-collapse:collapse">${rows}</table>` +
    `</div>`;
}

function buildDigestEmailHtml(digest: DailyDigest, topArticles: Article[]): string {
  const date = formatDate(digest.digest_date);
  const topics: Record<string, string> = JSON.parse(digest.topic_summaries);

  const topArticlesHtml = buildTopArticlesHtml(topArticles);

  let topicHtml = '';
  for (const [topic, summary] of Object.entries(topics)) {
    const label = TOPIC_LABELS[topic as Topic] || topic;
    topicHtml += `<tr><td style="padding:12px 0;border-bottom:1px solid #e5e5e5"><strong>${label}</strong><br>${summary}</td></tr>`;
  }

  return `
<div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;line-height:1.6">
  <h2 style="margin:0 0 4px">Azadi Wire Daily Digest</h2>
  <p style="color:#666;margin:0 0 20px;font-size:14px">${date} &middot; ${digest.article_count} articles</p>
  <p>${digest.overall_summary}</p>
  ${topArticlesHtml}
  <table style="width:100%;border-collapse:collapse;margin:24px 0">${topicHtml}</table>
  <p style="margin:24px 0 0"><a href="https://azadiwire.org/digest/${digest.digest_date}" style="color:#111;font-weight:600">Read full digest on the web &rarr;</a></p>
  <p style="font-size:12px;color:#999;margin:16px 0 0">This digest and its Top Stories are generated by AI and may contain inaccuracies. Always refer to the original sources for full reporting.</p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
  <p style="font-size:12px;color:#999">You're receiving this because you subscribed to the Azadi Wire Daily Digest.<br>
  <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#999">Unsubscribe</a></p>
</div>`.trim();
}

async function sendDigestBroadcast(env: ResendEnv, digest: DailyDigest, topArticles: Article[]): Promise<void> {
  const resend = getResendClient(env);
  const audienceOrSegment = env.RESEND_SEGMENT_ID ?? env.RESEND_AUDIENCE_ID;
  if (!resend || !audienceOrSegment || !env.RESEND_FROM_EMAIL) return;

  const date = formatDate(digest.digest_date);

  const { data, error } = await resend.broadcasts.create({
    ...(env.RESEND_SEGMENT_ID
      ? { segmentId: env.RESEND_SEGMENT_ID }
      : { audienceId: env.RESEND_AUDIENCE_ID! }),
    from: env.RESEND_FROM_EMAIL,
    subject: `Azadi Wire Daily Digest — ${date}`,
    html: buildDigestEmailHtml(digest, topArticles),
    send: true,
  });

  if (error || !data) {
    const noContacts =
      error?.message?.includes('no contacts') ||
      (error as { statusCode?: number } | null)?.statusCode === 422;
    if (!noContacts) {
      console.error('Failed to create/send digest broadcast', error);
    }
  }
}

const MIN_ARTICLES_FOR_DIGEST = 3;
const DIGEST_HOUR_UTC = 18;

export async function maybeGenerateDigest(db: any, ai?: any, env?: ResendEnv): Promise<boolean> {
  const now = new Date();
  if (now.getUTCHours() < DIGEST_HOUR_UTC) return false;

  const today = now.toISOString().slice(0, 10);

  const exists = await digestExistsForDate(db, today);
  if (exists) return false;

  const articles = await getTodayArticles(db);
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

  let topArticles: Article[] = [];
  try {
    topArticles = await getTopArticles(db, 5, 24);
  } catch {
    // non-critical
  }

  if (env) {
    try {
      await sendDigestBroadcast(env, digest, topArticles);
    } catch (err) {
      console.error('Digest email broadcast failed', err);
    }
  }

  return true;
}
