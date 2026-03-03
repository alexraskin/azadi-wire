export interface Article {
  id: string;
  title: string;
  summary: string | null;
  source_name: string;
  source_url: string | null;
  article_url: string;
  thumbnail_url: string | null;
  published_at: string;
  fetched_at: string;
  topic: Topic;
}

export interface Source {
  id: string;
  name: string;
  url: string;
  type: 'rss' | 'scrape';
  active: number;
}

export type Topic =
  | 'human_rights'
  | 'politics'
  | 'culture'
  | 'protests'
  | 'sanctions'
  | 'general';

export const TOPICS: Topic[] = [
  'human_rights',
  'politics',
  'culture',
  'protests',
  'sanctions',
  'general',
];

export const TOPIC_LABELS: Record<Topic, string> = {
  human_rights: 'Human Rights',
  politics: 'Politics',
  culture: 'Culture',
  protests: 'Protests',
  sanctions: 'Sanctions',
  general: 'General',
};

export interface TopicCount {
  name: string;
  count: number;
}

export interface ArticlesResponse {
  articles: Article[];
  total: number;
  page: number;
  pages: number;
}

export interface FeedItem {
  title: string;
  summary: string | null;
  article_url: string;
  thumbnail_url: string | null;
  published_at: string;
}
