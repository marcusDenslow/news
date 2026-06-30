// Shared types between the Miniflux server client and the UI.

export type EntryStatus = "read" | "unread" | "removed";

export interface Enclosure {
  id: number;
  url: string;
  mime_type: string;
  size: number;
}

export interface RawFeed {
  id: number;
  user_id: number;
  feed_url: string;
  site_url: string;
  title: string;
  description: string;
  category: Category;
  parsing_error_count: number;
  disabled: boolean;
  hide_globally: boolean;
}

export interface RawEntry {
  id: number;
  user_id: number;
  feed_id: number;
  status: EntryStatus;
  title: string;
  url: string;
  comments_url: string;
  author: string;
  content: string;
  published_at: string;
  created_at: string;
  reading_time: number;
  starred: boolean;
  enclosures: Enclosure[] | null;
  feed: RawFeed;
}

export interface Category {
  id: number;
  title: string;
  user_id: number;
  hide_globally: boolean;
}

// Slim payload sent to the client for cards (no full content).
export interface CardEntry {
  id: number;
  title: string;
  url: string;
  author: string;
  publishedAt: string;
  readingTime: number;
  starred: boolean;
  status: EntryStatus;
  feedId: number;
  feedTitle: string;
  domain: string;
  image: string | null;
  excerpt: string;
}

// Full entry for the reader view (includes content).
export interface FullEntry extends CardEntry {
  content: string;
  commentsUrl: string;
}

export interface Counters {
  reads: Record<string, number>;
  unreads: Record<string, number>;
}

export interface FeedNode {
  id: number;
  title: string;
  siteUrl: string;
  unread: number;
  errored: boolean;
}

export interface CategoryNode {
  id: number;
  title: string;
  unread: number;
  feeds: FeedNode[];
}

export interface FeedsTree {
  totalUnread: number;
  starred: number;
  categories: CategoryNode[];
}

// ---- UI filter model (client only) ----
export type FilterKind = "today" | "unread" | "starred" | "category" | "feed";

export interface Filter {
  kind: FilterKind;
  id?: number;
  label: string;
}
