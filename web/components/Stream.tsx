"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Loader2, Inbox, AlertCircle, Check } from "lucide-react";
import type { CardEntry, Filter } from "@/lib/types";
import { Card, HeroCarousel } from "@/components/Card";
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
  onOpen: (e: CardEntry, originRect?: DOMRect) => void;
  onToggleStar: (e: CardEntry) => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

const MIN_CARD = 300;
const COL_GAP = 22;
const MAX_COLS = 6;

interface Grid {
  cols: number;
  width: number; // explicit px width per column
  inner: number; // usable content width
}

const FRONT_BREAK = 760; // hero + briefs go side-by-side above this inner width
const FRONT_GAP = 22;
const VIRT_BUFFER = 1200; // render cards within this many px of the viewport
const VIRT_STEP = 500; // only recompute the visible set after scrolling this far

// Which card ids have already played their entrance. Module-level so it survives
// a card being virtualized out and back (remounted). New entries (new ids, e.g.
// a page loaded by infinite scroll or a fresh filter) aren't in it yet, so they
// animate in; already-seen cards don't re-animate on scroll-back.
const revealedIds = new Set<number>();

// Column count + an explicit per-column width. The width is driven from React
// state (not CSS flex), so on a resize/zoom the columns hold their old width
// for one frame until we commit the new one — which lets Framer's `layout`
// bracket the full before/after and glide every card to its new spot. With
// CSS flex the browser teleports the cards before any JS runs, so Framer only
// ever caught the tiny column-count delta.
function useGrid(ref: React.RefObject<HTMLDivElement | null>): Grid {
  const [grid, setGrid] = useState<Grid>({ cols: 3, width: MIN_CARD, inner: MIN_CARD * 3 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calc = () => {
      const cs = getComputedStyle(el);
      const inner = Math.round(
        el.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0")
      );
      const cols = Math.min(
        MAX_COLS,
        Math.max(1, Math.floor((inner + COL_GAP) / (MIN_CARD + COL_GAP)))
      );
      const width = Math.max(1, Math.floor((inner - (cols - 1) * COL_GAP) / cols));
      setGrid((prev) =>
        prev.cols === cols && prev.width === width && prev.inner === inner
          ? prev
          : { cols, width, inner }
      );
    };
    calc();
    // Coalesce to one update per frame — enough to keep up with a drag while
    // giving Framer a clean commit to animate from.
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(calc);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ref]);
  return grid;
}

interface Placement {
  x: number;
  y: number;
  h: number;
}
interface MasonryLayout {
  pos: Map<number, Placement>;
  height: number;
  onHeight: (id: number, h: number) => void;
}

// Estimate a card's height before it has been measured, so the first paint
// isn't a pile-up at y=0. Image cards have a fixed 16:10 media box.
function estimateHeight(e: CardEntry, width: number): number {
  const inner = width - 20; // card padding
  return e.image ? Math.round((inner * 10) / 16) + 148 : 196;
}

// Balanced masonry into absolute x/y placements. Every card is a sibling in one
// container keyed by id, so changing the column count never remounts anything —
// each card just animates its transform to the new slot (a smooth glide).
function useMasonryLayout(items: CardEntry[], cols: number, colWidth: number): MasonryLayout {
  const heights = useRef<Map<number, number>>(new Map());
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  const bumpRaf = useRef(0);

  const onHeight = useCallback((id: number, h: number) => {
    const prev = heights.current.get(id);
    if (prev !== undefined && Math.abs(prev - h) < 1) return;
    heights.current.set(id, h);
    // Coalesce many measurements (images loading) into one recompute per frame.
    if (!bumpRaf.current) {
      bumpRaf.current = requestAnimationFrame(() => {
        bumpRaf.current = 0;
        bump();
      });
    }
  }, []);

  useEffect(() => () => cancelAnimationFrame(bumpRaf.current), []);

  const pos = useMemo(() => {
    /* eslint-disable react-hooks/refs */
    const h = heights.current;
    const colH = new Array(cols).fill(0);
    const map = new Map<number, Placement>();
    for (const e of items) {
      let c = 0;
      for (let i = 1; i < cols; i++) if (colH[i] < colH[c]) c = i;
      const cardH = h.get(e.id) ?? estimateHeight(e, colWidth);
      map.set(e.id, { x: c * (colWidth + COL_GAP), y: colH[c], h: cardH });
      colH[c] += cardH + COL_GAP;
    }
    const height = Math.max(0, ...colH.map((v) => v - COL_GAP));
    return { map, height };
    /* eslint-enable react-hooks/refs */
    // `version` (bumped after each height change) drives recompute; `heights`
    // is a stable ref cache read during render on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cols, colWidth, version]);

  return { pos: pos.map, height: pos.height, onHeight };
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
      <div className="flow-skeleton">
        {Array.from({ length: 3 }).map((_, c) => (
          <div className="flow-skeleton__col" key={c}>
            {Array.from({ length: 3 }).map((_, r) => {
              const i = c * 3 + r;
              return (
                <div key={r} className="skeleton-card">
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
              );
            })}
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
  const { cols, width: colWidth, inner } = useGrid(streamRef);

  // The lead is now a carousel over the top few stories; the Latest rail and the
  // flow pick up after it so nothing shows twice.
  const heroPool = useMemo(() => entries.slice(0, 5), [entries]);
  const briefs = entries.slice(5, 9);
  const flow = useMemo(() => entries.slice(9), [entries]);
  const { pos, height: flowHeight, onHeight } = useMasonryLayout(flow, cols, colWidth);

  // Virtualization: track the flow's position in the viewport and render only
  // the cards near it. Positions for all cards are still computed (cheap, O(n)),
  // so the scrollbar height stays correct — we just skip rendering the rest.
  const flowRef = useRef<HTMLDivElement>(null);
  const [win, setWin] = useState({ scrollY: 0, flowTop: 0, vh: 1200 });
  useEffect(() => {
    const flowTop = () =>
      flowRef.current ? flowRef.current.getBoundingClientRect().top + window.scrollY : 0;
    // Only re-render once the scroll passes VIRT_STEP — cards then mount/unmount
    // in bursts, never every frame. Returning the same state object bails the
    // React re-render, so sub-step scrolling costs nothing.
    const onScroll = () =>
      setWin((w) =>
        Math.abs(window.scrollY - w.scrollY) > VIRT_STEP ? { ...w, scrollY: window.scrollY } : w
      );
    const onResize = () =>
      setWin({ scrollY: window.scrollY, flowTop: flowTop(), vh: window.innerHeight });
    onResize();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [isLoadingInitial]);

  const visibleFlow = useMemo(() => {
    const top = win.scrollY - win.flowTop - VIRT_BUFFER;
    const bottom = win.scrollY - win.flowTop + win.vh + VIRT_BUFFER;
    return flow.filter((e) => {
      const p = pos.get(e.id);
      if (!p) return true;
      return p.y + p.h >= top && p.y <= bottom;
    });
  }, [flow, pos, win]);

  // Front-page proportions, JS-controlled so Framer can animate the resize.
  const stacked = inner < FRONT_BREAK;
  const heroW = stacked ? inner : Math.round(((inner - FRONT_GAP) * 1.62) / 2.62);
  const briefsW = stacked ? inner : Math.max(0, inner - FRONT_GAP - heroW);

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
            <div className="frontpage" data-stacked={stacked}>
              <div className="frontpage__col" style={{ width: heroW }}>
                <HeroCarousel entries={heroPool} onOpen={onOpen} />
              </div>
              <div className="briefs" style={{ width: briefsW }}>
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
            heroPool.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <HeroCarousel entries={heroPool} onOpen={onOpen} />
              </div>
            )
          )}

          {flow.length > 0 && (
            <div className="flow" ref={flowRef} style={{ height: flowHeight }}>
              {visibleFlow.map((entry) => {
                const p = pos.get(entry.id) ?? { x: 0, y: 0, h: 0 };
                return (
                  <Card
                    key={entry.id}
                    entry={entry}
                    x={p.x}
                    y={p.y}
                    width={colWidth}
                    onOpen={onOpen}
                    onToggleStar={onToggleStar}
                    onHeight={onHeight}
                    revealed={revealedIds}
                  />
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
