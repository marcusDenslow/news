"use client";

import { Loader2, Inbox, AlertCircle, Check } from "lucide-react";
import type { CardEntry, Filter } from "@/lib/types";
import { Card, Hero } from "@/components/Card";

interface StreamProps {
  entries: CardEntry[];
  filter: Filter;
  search: string;
  total: number;
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  isReachingEnd: boolean;
  isEmpty: boolean;
  error: unknown;
  onOpen: (e: CardEntry) => void;
  onToggleStar: (e: CardEntry) => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

function masthead(filter: Filter, search: string) {
  if (search.trim()) {
    return { eyebrow: "SEARCH", title: `“${search.trim()}”` };
  }
  if (filter.kind === "today") {
    // Pinned locale keeps server/client formatting identical (avoids hydration mismatch).
    const d = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    return { eyebrow: d.toUpperCase(), title: "Today" };
  }
  const eyebrows: Record<string, string> = {
    unread: "Latest",
    starred: "Saved",
    category: "Channel",
    feed: "Channel",
  };
  return { eyebrow: eyebrows[filter.kind] ?? "", title: filter.label };
}

function SkeletonStream() {
  return (
    <>
      <div className="skeleton-card" style={{ marginBottom: 22 }}>
        <div className="shimmer" style={{ aspectRatio: "16 / 8", minHeight: 280 }} />
      </div>
      <div className="masonry">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="skeleton-card">
            {i % 3 !== 1 && <div className="shimmer" style={{ aspectRatio: "16 / 10" }} />}
            <div style={{ padding: "14px 16px 18px" }}>
              <div className="shimmer" style={{ height: 11, width: "40%", borderRadius: 5, marginBottom: 12 }} />
              <div className="shimmer" style={{ height: 16, width: "92%", borderRadius: 5, marginBottom: 8 }} />
              <div className="shimmer" style={{ height: 16, width: "70%", borderRadius: 5, marginBottom: 14 }} />
              <div className="shimmer" style={{ height: 10, width: "30%", borderRadius: 5 }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function Stream({
  entries,
  filter,
  search,
  total,
  isLoadingInitial,
  isLoadingMore,
  isReachingEnd,
  isEmpty,
  error,
  onOpen,
  onToggleStar,
  sentinelRef,
}: StreamProps) {
  const { eyebrow, title } = masthead(filter, search);
  const [hero, ...rest] = entries;

  return (
    <div className="stream">
      <header className="masthead">
        <div className="masthead__eyebrow" suppressHydrationWarning>
          {eyebrow}
        </div>
        <h1 className="masthead__title">{title}</h1>
        {!isLoadingInitial && total > 0 && (
          <div className="masthead__sub">
            {total.toLocaleString()} {total === 1 ? "story" : "stories"}
          </div>
        )}
      </header>

      {isLoadingInitial ? (
        <SkeletonStream />
      ) : error ? (
        <div className="center-state">
          <AlertCircle className="size-7" />
          <div>
            <div style={{ fontWeight: 600, color: "var(--foreground)" }}>Couldn’t load stories</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>
              Check that Miniflux is running and reachable.
            </div>
          </div>
        </div>
      ) : isEmpty ? (
        <div className="center-state">
          <Inbox className="size-8" />
          <div>
            <div style={{ fontWeight: 600, color: "var(--foreground)" }}>Nothing here</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>
              {filter.kind === "starred"
                ? "Bookmark a story and it’ll show up here."
                : search.trim()
                ? "No stories match your search."
                : "You’re all caught up."}
            </div>
          </div>
        </div>
      ) : (
        <>
          {hero && <Hero entry={hero} onOpen={onOpen} />}
          <div className="masonry">
            {rest.map((entry, i) => (
              <Card
                key={entry.id}
                entry={entry}
                index={i}
                onOpen={onOpen}
                onToggleStar={onToggleStar}
              />
            ))}
          </div>
        </>
      )}

      <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />

      {!isLoadingInitial && isLoadingMore && (
        <div className="center-state" style={{ padding: "40px 0" }}>
          <Loader2 className="size-6 spin" />
        </div>
      )}
      {!isLoadingInitial && !isEmpty && isReachingEnd && entries.length > 6 && (
        <div className="center-state" style={{ padding: "48px 0", gap: 8 }}>
          <Check className="size-5" />
          <span style={{ fontSize: 14 }}>You’re all caught up</span>
        </div>
      )}
    </div>
  );
}
