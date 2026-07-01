"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Loader2, Inbox, AlertCircle, Check } from "lucide-react";
import type { CardEntry, Filter } from "@/lib/types";
import { Card, Hero } from "@/components/Card";
import { MediaImg } from "@/components/Img";
import { feedColor, relativeTime } from "@/lib/format";

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

const MIN_CARD = 300;
const COL_GAP = 22;
const MAX_COLS = 6;

// Column count grows to fill the available width — when there's room for another
// full-width card, add one (never squishes below MIN_CARD).
function useColumns(ref: React.RefObject<HTMLDivElement | null>) {
  const [cols, setCols] = useState(3);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calc = () => {
      const cs = getComputedStyle(el);
      const inner =
        el.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0");
      const n = Math.min(
        MAX_COLS,
        Math.max(1, Math.floor((inner + COL_GAP) / (MIN_CARD + COL_GAP)))
      );
      setCols((prev) => (prev === n ? prev : n));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return cols;
}

function distribute<T>(items: T[], n: number): T[][] {
  const cols: T[][] = Array.from({ length: n }, () => []);
  items.forEach((it, i) => cols[i % n].push(it));
  return cols;
}

function masthead(filter: Filter, search: string) {
  if (search.trim()) return { eyebrow: "Search", title: `“${search.trim()}”` };
  if (filter.kind === "today") {
    const d = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    return { eyebrow: d, title: "Today" };
  }
  const eyebrows: Record<string, string> = {
    unread: "Unread",
    starred: "Saved",
    category: "Channel",
    feed: "Channel",
  };
  return { eyebrow: eyebrows[filter.kind] ?? "", title: filter.label };
}

function Brief({ entry, onOpen }: { entry: CardEntry; onOpen: (e: CardEntry) => void }) {
  const open = () => onOpen(entry);
  return (
    <div
      className="brief"
      style={{ "--feed": feedColor(entry.feedId) } as React.CSSProperties}
      data-read={entry.status === "read"}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
    >
      <div className="brief__body">
        <div className="brief__source">{entry.feedTitle}</div>
        <div className="brief__title line-clamp-3">{entry.title}</div>
        <div className="brief__meta">
          {relativeTime(entry.publishedAt)}
          {entry.readingTime > 0 && ` · ${entry.readingTime} min`}
        </div>
      </div>
      {entry.image && (
        <div className="brief__thumb">
          <MediaImg src={entry.image} />
        </div>
      )}
    </div>
  );
}

function SkeletonStream() {
  return (
    <>
      <div className="frontpage">
        <div className="skeleton-card" style={{ padding: 0 }}>
          <div className="shimmer" style={{ aspectRatio: "16 / 10", minHeight: 360 }} />
        </div>
        <div className="skeleton-card">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 13, padding: "13px 8px" }}>
              <div style={{ flex: 1 }}>
                <div className="shimmer" style={{ height: 10, width: "35%", borderRadius: 5, marginBottom: 10 }} />
                <div className="shimmer" style={{ height: 14, width: "94%", borderRadius: 5, marginBottom: 7 }} />
                <div className="shimmer" style={{ height: 14, width: "60%", borderRadius: 5 }} />
              </div>
              <div className="shimmer" style={{ width: 66, height: 66, borderRadius: 14, flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="flow">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="skeleton-card">
            {i % 3 !== 1 && (
              <div className="shimmer" style={{ aspectRatio: "16 / 10", borderRadius: 16 }} />
            )}
            <div style={{ padding: "13px 8px 8px" }}>
              <div className="shimmer" style={{ height: 11, width: "40%", borderRadius: 5, marginBottom: 11 }} />
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
  const streamRef = useRef<HTMLDivElement>(null);
  const cols = useColumns(streamRef);

  const lead = entries[0];
  const briefs = entries.slice(1, 5);
  const flow = entries.slice(5);

  return (
    <div className="stream" ref={streamRef}>
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
          {briefs.length > 0 ? (
            <div className="frontpage">
              <Hero entry={lead} onOpen={onOpen} />
              <div className="briefs">
                <div className="briefs__head">
                  <span className="briefs__pulse" />
                  Latest
                </div>
                {briefs.map((e) => (
                  <Brief key={e.id} entry={e} onOpen={onOpen} />
                ))}
              </div>
            </div>
          ) : (
            lead && (
              <div style={{ marginBottom: 24 }}>
                <Hero entry={lead} onOpen={onOpen} />
              </div>
            )
          )}

          {flow.length > 0 && (
            <div className="flow">
              {distribute(flow, cols).map((col, ci) => {
                const center = (cols - 1) / 2;
                const dir = ci < center ? -1 : ci > center ? 1 : 0;
                const dist = Math.abs(ci - center);
                return (
                  <motion.div
                    className="flow-col"
                    key={`col-${cols}-${ci}`}
                    initial={{ opacity: 0, x: dir * 36, y: dir === 0 ? 14 : 0 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: dist * 0.05 }}
                  >
                    {col.map((entry, i) => (
                      <Card
                        key={entry.id}
                        entry={entry}
                        index={i}
                        onOpen={onOpen}
                        onToggleStar={onToggleStar}
                      />
                    ))}
                  </motion.div>
                );
              })}
            </div>
          )}
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
