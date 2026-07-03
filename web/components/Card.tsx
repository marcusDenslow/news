"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import type { CardEntry } from "@/lib/types";
import { feedColor, relativeTime } from "@/lib/format";
import { Favicon, MediaImg } from "@/components/Img";

const EASE = [0.22, 1, 0.36, 1] as const;

interface CardProps {
  entry: CardEntry;
  x: number;
  y: number;
  width: number;
  onOpen: (entry: CardEntry, originRect?: DOMRect) => void;
  onToggleStar: (entry: CardEntry) => void;
  onHeight: (id: number, h: number) => void;
  revealed: Set<number>; // ids that have already played their entrance
}

function activateOnKey(handler: (e: React.KeyboardEvent) => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler(e);
    }
  };
}

// The card image's on-screen rect, read off the clicked element — the reader
// flies a single image from exactly here into its hero.
function rectOf(root: Element, selector: string): DOMRect | undefined {
  return (root.querySelector(selector) as HTMLElement | null)?.getBoundingClientRect();
}

// Memoized: when the virtualized set shifts on scroll, only newly-mounted cards
// render — the ones already on screen keep the same props and skip re-rendering.
export const Card = memo(function Card({
  entry,
  x,
  y,
  width,
  onOpen,
  onToggleStar,
  onHeight,
  revealed,
}: CardProps) {
  const hasImage = Boolean(entry.image);
  const ref = useRef<HTMLElement>(null);
  const open = (e: React.MouseEvent | React.KeyboardEvent) =>
    onOpen(entry, rectOf(e.currentTarget, ".card__media"));

  // Entrance phases:
  //   seen    – already animated in an earlier session on screen; show normally
  //   pending – not yet scrolled into view; held invisible
  //   enter   – crossing into view now; play the animation (once)
  // Cards mount ~a screenful early (virtualization buffer), so we key the
  // animation off actual viewport entry, not mount — otherwise it plays
  // off-screen. `revealed` survives virtualized remounts, so no re-animation.
  const [phase, setPhase] = useState<"seen" | "pending" | "enter">(() =>
    revealed.has(entry.id) ? "seen" : "pending"
  );

  // Report rendered height so the masonry can stack columns; re-fires when the
  // title rewraps at a new width (ResizeObserver).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => onHeight(entry.id, el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [entry.id, onHeight]);

  // Fire the entrance the first time the card scrolls into view.
  useEffect(() => {
    if (phase !== "pending") return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          revealed.add(entry.id);
          setPhase("enter");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [phase, entry.id, revealed]);

  return (
    // Slot is placed by JS via a transform; a plain CSS transition glides it to
    // its new spot on reflow — no per-card animation runtime, no GPU-layer spam.
    <div
      className="card-slot"
      data-phase={phase}
      style={{ width, transform: `translate(${x}px, ${y}px)` }}
    >
      <article
        ref={ref}
        className={`card ${hasImage ? "card--image" : "card--text"}`}
        data-read={entry.status === "read"}
        data-initial={(entry.feedTitle || "•").slice(0, 1).toUpperCase()}
        style={{ "--feed": feedColor(entry.feedId) } as React.CSSProperties}
        onClick={open}
        onKeyDown={activateOnKey(open)}
        role="button"
        tabIndex={0}
      >
        {hasImage && (
          <div className="card__media">
            <MediaImg src={entry.image!} />
          </div>
        )}

        <div className="card__body">
          <div className="card__source">
            <Favicon feedId={entry.feedId} className="card__favicon" />
            <span className="card__source-name">{entry.feedTitle}</span>
          </div>

          <h2 className={`card__title ${hasImage ? "line-clamp-3" : "line-clamp-4"}`}>
            {entry.title}
          </h2>

          {!hasImage && entry.excerpt && (
            <p className="card__excerpt line-clamp-4">{entry.excerpt}</p>
          )}

          <div className="card__meta">
            <span>{relativeTime(entry.publishedAt)}</span>
            {entry.readingTime > 0 && (
              <>
                <span className="dot" />
                <span>{entry.readingTime} min</span>
              </>
            )}
            <button
              type="button"
              className="card__star"
              data-on={entry.starred}
              aria-label={entry.starred ? "Remove bookmark" : "Bookmark"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar(entry);
              }}
            >
              <Star size={15} strokeWidth={2} fill={entry.starred ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </article>
    </div>
  );
});

export function Hero({
  entry,
  onOpen,
  noEnter,
}: {
  entry: CardEntry;
  onOpen: (e: CardEntry, originRect?: DOMRect) => void;
  // Skip the mount fade/rise — used inside the carousel, where the slide itself
  // carries the entrance so the two animations don't fight.
  noEnter?: boolean;
}) {
  const hasImage = Boolean(entry.image);
  const open = (e: React.MouseEvent | React.KeyboardEvent) =>
    onOpen(entry, rectOf(e.currentTarget, ".hero__media-img"));
  const color = feedColor(entry.feedId);
  const enterProps = noEnter
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 18 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.55, ease: EASE },
      };

  const source = (
    <div className="hero__source">
      <Favicon feedId={entry.feedId} />
      <span>{entry.feedTitle}</span>
    </div>
  );

  const meta = (
    <div className="hero__meta">
      <span>{relativeTime(entry.publishedAt)}</span>
      {entry.readingTime > 0 && (
        <>
          <span className="dot" />
          <span>{entry.readingTime} min read</span>
        </>
      )}
    </div>
  );

  if (!hasImage) {
    return (
      <motion.article
        className="hero hero--text"
        style={{ "--feed": color } as React.CSSProperties}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
        onClick={open}
        onKeyDown={activateOnKey(open)}
        role="button"
        tabIndex={0}
      >
        {source}
        <h1 className="hero__title line-clamp-3">{entry.title}</h1>
        {entry.excerpt && <p className="hero__excerpt line-clamp-3">{entry.excerpt}</p>}
        {meta}
      </motion.article>
    );
  }

  return (
    <motion.article
      className="hero"
      style={{ "--feed": color } as React.CSSProperties}
      {...enterProps}
      onClick={open}
      onKeyDown={activateOnKey(open)}
      role="button"
      tabIndex={0}
    >
      <div className="hero__media">
        <div className="hero__media-img">
          <MediaImg src={entry.image!} eager />
        </div>
        <div className="hero__scrim" />
      </div>
      <div className="hero__content">
        {source}
        <h1 className="hero__title line-clamp-3">{entry.title}</h1>
        {entry.excerpt && <p className="hero__excerpt line-clamp-2">{entry.excerpt}</p>}
        {meta}
      </div>
    </motion.article>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero carousel — the lead card cycles through the top few stories.  */
/* ------------------------------------------------------------------ */

const MAX_HERO = 5;
const AUTO_MS = 6500;
const SLIDE_EASE = [0.32, 0.72, 0, 1] as const;

// dir: +1 → new story enters from the right, old leaves left (advancing).
// dir 0 is the first mount — a plain rise/fade, not a horizontal slide.
const slideV: Variants = {
  enter: (dir: number) =>
    dir === 0 ? { opacity: 0, y: 16 } : { x: dir > 0 ? "101%" : "-101%", opacity: 0.4 },
  center: { x: 0, y: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? "-101%" : "101%", opacity: 0.4 }),
};

export function HeroCarousel({
  entries,
  onOpen,
}: {
  entries: CardEntry[];
  onOpen: (e: CardEntry, originRect?: DOMRect) => void;
}) {
  const items = useMemo(() => entries.slice(0, MAX_HERO), [entries]);
  const count = items.length;
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [[index, dir], setState] = useState<[number, number]>([0, 0]);
  const [paused, setPaused] = useState(false);

  // Clamp when the pool shrinks under a live refresh so we never index past it.
  const safeIndex = count ? Math.min(index, count - 1) : 0;
  const current = items[safeIndex];

  const paginate = useCallback(
    (step: number) => setState(([i]) => [(i + step + count) % count, step > 0 ? 1 : -1]),
    [count]
  );
  const goTo = useCallback(
    (to: number) => setState(([i]) => [to, to === i ? 0 : to > i ? 1 : -1]),
    []
  );

  // Auto-advance, re-armed after every change (manual or auto). Held while the
  // pointer is over the card, for reduced-motion, or a single-item pool.
  useEffect(() => {
    if (paused || reduce || count <= 1) return;
    const t = setTimeout(() => paginate(1), AUTO_MS);
    return () => clearTimeout(t);
  }, [paused, reduce, count, paginate, index]);

  // Horizontal navigation by gesture: two-finger trackpad swipe (wheel) and
  // finger swipe (touch). Both must yield exactly ONE story per physical swipe.
  // Deltas accumulate to a threshold, then the carousel locks until the gesture
  // *settles* — an idle gap with no more events. A fixed-time lock used to let a
  // hard fling's momentum tail trip a second advance ~half a second later;
  // settling on idle ties one swipe to one story no matter how hard it's thrown.
  // Wheel is non-passive so preventDefault sticks (else Safari reads it as a
  // history back/forward swipe).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || count <= 1) return;
    const THRESHOLD = 38; // total horizontal travel (px) to flip one story
    let acc = 0;
    let lock = false;
    let idle = 0;

    // Keep the gesture "alive" on every event; unlock + reset only once it stops.
    const keepAlive = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        acc = 0;
        lock = false;
      }, 140);
    };

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical scroll — ignore
      e.preventDefault();
      keepAlive();
      if (lock) return;
      if ((acc > 0) !== (e.deltaX > 0)) acc = 0; // reversed direction — restart the tally
      acc += e.deltaX;
      if (Math.abs(acc) < THRESHOLD) return;
      paginate(acc > 0 ? 1 : -1);
      acc = 0;
      lock = true; // held until the momentum settles, so it can't advance twice
    };

    // Touch swipe (phones): a finger drag never fires `wheel`, so it needs its
    // own path. Track horizontal travel; flip one story on release.
    let sx = 0;
    let sy = 0;
    let touching = false;
    let horiz = false;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      touching = true;
      horiz = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!touching) return;
      const dx = e.touches[0].clientX - sx;
      const dy = e.touches[0].clientY - sy;
      if (!horiz && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) horiz = true;
      if (horiz) e.preventDefault(); // own it — stop the page scrolling under the swipe
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touching) return;
      touching = false;
      const t = e.changedTouches[0];
      const dx = (t?.clientX ?? sx) - sx;
      const dy = (t?.clientY ?? sy) - sy;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) paginate(dx < 0 ? 1 : -1);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      window.clearTimeout(idle);
    };
  }, [count, paginate]);

  if (count === 0) return null;

  return (
    <div
      className="hero-carousel"
      ref={rootRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <AnimatePresence custom={dir}>
        <motion.div
          key={current.id}
          className="hero-carousel__slide"
          custom={dir}
          variants={reduce ? undefined : slideV}
          initial={reduce ? false : "enter"}
          animate={reduce ? undefined : "center"}
          exit={reduce ? undefined : "exit"}
          transition={{
            x: { duration: 0.52, ease: SLIDE_EASE },
            opacity: { duration: 0.3 },
            y: { duration: 0.5, ease: EASE },
          }}
        >
          <Hero entry={current} onOpen={onOpen} noEnter />
        </motion.div>
      </AnimatePresence>

      {count > 1 && (
        <div className="hero-carousel__controls">
          <button
            type="button"
            className="hero-carousel__arrow"
            aria-label="Previous story"
            onClick={() => paginate(-1)}
          >
            <ChevronLeft size={26} strokeWidth={1.6} />
          </button>
          <div className="hero-carousel__dots" role="tablist" aria-label="Lead stories">
            {items.map((it, i) => (
              <button
                key={it.id}
                type="button"
                role="tab"
                aria-selected={i === safeIndex}
                aria-label={`Story ${i + 1} of ${count}`}
                className="hero-carousel__dot"
                data-active={i === safeIndex}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
          <button
            type="button"
            className="hero-carousel__arrow"
            aria-label="Next story"
            onClick={() => paginate(1)}
          >
            <ChevronRight size={26} strokeWidth={1.6} />
          </button>
        </div>
      )}

      {count > 1 && !reduce && (
        // Auto-advance countdown. Keyed on the index so the ring restarts each
        // story; play-state follows `paused` so it freezes with the timer on hover.
        <div className="hero-carousel__timer" aria-hidden>
          <svg viewBox="0 0 36 36">
            <circle className="hero-carousel__timer-track" cx="18" cy="18" r="16" />
            <circle
              key={safeIndex}
              className="hero-carousel__timer-fill"
              cx="18"
              cy="18"
              r="16"
              pathLength={100}
              style={{
                animationDuration: `${AUTO_MS}ms`,
                animationPlayState: paused ? "paused" : "running",
              }}
            />
          </svg>
        </div>
      )}
    </div>
  );
}
