"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useReducedMotion,
  usePresence,
  animate,
  type Variants,
} from "motion/react";
import useSWR from "swr";
import {
  ArrowLeft,
  Star,
  ExternalLink,
  Loader2,
  Sparkles,
  Undo2,
} from "lucide-react";
import type { CardEntry, FullEntry } from "@/lib/types";
import { imgProxy, feedColor, fullDate, readingTimeLabel, jsonFetcher } from "@/lib/format";
import { Favicon, MediaImg } from "@/components/Img";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const EASE = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.4, 0, 0.28, 1] as const;

function processHtml(html: string): string {
  if (typeof window === "undefined" || !html) return html ?? "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    img.removeAttribute("srcset");
    img.removeAttribute("width");
    img.removeAttribute("height");
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    if (src && /^https?:\/\//.test(src)) img.setAttribute("src", imgProxy(src));
    else if (src) img.remove();
  });
  // <picture><source> would bypass our proxy — drop only those, NOT <video>/<audio> sources.
  doc.querySelectorAll("picture source").forEach((s) => s.remove());
  doc.querySelectorAll("a").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });
  doc.querySelectorAll("iframe").forEach((f) => {
    f.setAttribute("loading", "lazy");
    f.setAttribute("allowfullscreen", "true");
    // Some feeds lazy-load embeds via data-src; promote it so the video shows.
    const dataSrc = f.getAttribute("data-src");
    if (dataSrc && !f.getAttribute("src")) f.setAttribute("src", dataSrc);
  });
  doc.querySelectorAll("video").forEach((v) => {
    v.setAttribute("controls", "true");
    v.removeAttribute("autoplay");
  });
  return doc.body.innerHTML;
}

interface ReaderProps {
  entry: CardEntry;
  origin?: DOMRect; // on-screen rect of the source card image (undefined = brief)
  onClose: () => void;
  onToggleStar: (entry: CardEntry) => void;
}

export function Reader({ entry, origin, onClose, onToggleStar }: ReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: scrollRef });
  const reduce = useReducedMotion();

  // ---- Single-element hero morph -------------------------------------------
  // One <img> box flies from the card's on-screen rect into the hero and back.
  // No shared-layout crossfade — there is only ever this one element in flight,
  // so the eye tracks it cleanly. The page is scroll-locked while open, so the
  // captured `origin` rect stays valid for the collapse on close.
  const heroRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<{ dx: number; dy: number; sx: number; sy: number } | null>(null);
  const [isPresent, safeToRemove] = usePresence();

  useLayoutEffect(() => {
    const el = heroRef.current;
    if (!el) return; // no hero (text-only entry)
    if (!origin) {
      // Opened from a brief thumbnail (aspect mismatch): just ease the hero up.
      if (!reduce) animate(el, { opacity: [0, 1], y: [10, 0] }, { duration: 0.5, ease: EASE });
      return;
    }
    const d = el.getBoundingClientRect();
    if (!d.width || !d.height) return;
    const flip = {
      dx: origin.left - d.left,
      dy: origin.top - d.top,
      sx: origin.width / d.width,
      sy: origin.height / d.height,
    };
    flipRef.current = flip;
    el.style.transformOrigin = "top left";
    if (reduce) return;
    animate(
      el,
      {
        x: [flip.dx, 0],
        y: [flip.dy, 0],
        scaleX: [flip.sx, 1],
        scaleY: [flip.sy, 1],
        // Radius is scaled by the transform, so counter-scale it: 16/sx renders
        // as ~16px (the card radius) at the shrunk end, 30px at full size.
        borderRadius: [`${16 / flip.sx}px`, "30px"],
      },
      { duration: 0.56, ease: EASE }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin]);

  // Collapse back into the card when the reader is being removed.
  useLayoutEffect(() => {
    if (isPresent) return;
    const el = heroRef.current;
    const flip = flipRef.current;
    if (!el || !flip || reduce) {
      if (el && !reduce) animate(el, { opacity: [1, 0] }, { duration: 0.26 });
      const t = setTimeout(() => safeToRemove?.(), reduce ? 0 : 300);
      return () => clearTimeout(t);
    }
    el.style.transformOrigin = "top left";
    animate(
      el,
      {
        x: [0, flip.dx],
        y: [0, flip.dy],
        scaleX: [1, flip.sx],
        scaleY: [1, flip.sy],
        borderRadius: ["30px", `${16 / flip.sx}px`],
      },
      { duration: 0.44, ease: EASE_IN }
    ).then(() => safeToRemove?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  // Reader text settles in after the hero has begun its flight, then leaves in a
  // quick downward cascade. Reduced motion collapses it all to a plain cut.
  const containerV: Variants = {
    hidden: {},
    show: {
      transition: reduce
        ? {}
        : { staggerChildren: 0.055, delayChildren: origin ? 0.16 : 0.05 },
    },
    exit: { transition: reduce ? {} : { staggerChildren: 0.028, staggerDirection: -1 } },
  };
  const itemV: Variants = {
    hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 18 },
    show: {
      opacity: 1,
      y: 0,
      transition: reduce ? { duration: 0 } : { duration: 0.5, ease: EASE },
    },
    exit: reduce
      ? { opacity: 1 }
      : { opacity: 0, y: 12, transition: { duration: 0.2, ease: "easeIn" } },
  };

  const { data, isLoading } = useSWR<FullEntry>(`/api/entries/${entry.id}`, jsonFetcher);

  const [fullHtml, setFullHtml] = useState<string | null>(null);
  const [showingFull, setShowingFull] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);

  // Lock the page behind the reader.
  useEffect(() => {
    document.body.classList.add("scroll-lock");
    return () => document.body.classList.remove("scroll-lock");
  }, []);

  // Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const baseHtml = data?.content ?? "";
  const displayedHtml = showingFull && fullHtml != null ? fullHtml : baseHtml;
  const processed = useMemo(() => processHtml(displayedHtml), [displayedHtml]);

  async function loadFull() {
    if (fullHtml != null) {
      setShowingFull(true);
      return;
    }
    setLoadingFull(true);
    try {
      const res = await fetch(`/api/entries/${entry.id}/fulltext`);
      const json = (await res.json()) as { content?: string };
      setFullHtml(json.content ?? "");
      setShowingFull(true);
    } catch {
      setFullHtml("");
    } finally {
      setLoadingFull(false);
    }
  }

  const color = feedColor(entry.feedId);
  const author = entry.author?.trim();

  return (
    <>
      <motion.div
        className="reader-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        onClick={onClose}
      />

      <motion.div className="reader" ref={scrollRef}>
        {entry.image && (
          <motion.div
            className="reader__ambient"
            aria-hidden
            style={{ backgroundImage: `url(${imgProxy(entry.image)})` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          />
        )}
        <motion.div className="reader__progress" style={{ scaleX: scrollYProgress, width: "100%" }} />

        <motion.div
          className="reader__bar"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full reader__back group/back"
                onClick={onClose}
                aria-label="Back"
              >
                <motion.span
                  className="reader__back-twirl"
                  whileHover={{ rotate: -375 }}
                  transition={{ type: "spring", stiffness: 200, damping: 14 }}
                >
                  <ArrowLeft className="size-5" />
                </motion.span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back (Esc)</TooltipContent>
          </Tooltip>

          <div className="reader__bar-spacer" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={() => onToggleStar(entry)}
                style={{ color: entry.starred ? "var(--news-accent)" : undefined }}
              >
                <Star className="size-5" fill={entry.starred ? "currentColor" : "none"} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{entry.starred ? "Bookmarked" : "Bookmark"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" asChild>
                <a href={entry.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-5" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open original</TooltipContent>
          </Tooltip>
        </motion.div>

        {entry.image && (
          <div className="reader__heroSection">
            {/* Driven imperatively (see the layout effects above): flies from the
                card's rect on open, collapses back on close. Plain div — it must not
                be under Motion's layout system or the flight fights the projection.
                The hero box takes the source card's aspect ratio so the morph is a
                clean uniform scale (see .reader__hero); default 16:10 for briefs.
                The scrim + title live outside this element so they never get
                caught in that transform — they just fade in over the final box. */}
            <div
              className="reader__hero"
              ref={heroRef}
              style={
                {
                  "--hero-aspect":
                    origin && origin.height > 0 ? origin.width / origin.height : undefined,
                  ...(!origin && !reduce ? { opacity: 0 } : null),
                } as React.CSSProperties
              }
            >
              <MediaImg src={entry.image} eager />
            </div>
            <div className="reader__heroScrim" aria-hidden />
            <motion.div
              className="reader__heroText"
              variants={containerV}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              <motion.div
                variants={itemV}
                className="reader__kicker"
                style={{ "--feed": color } as React.CSSProperties}
              >
                <Favicon feedId={entry.feedId} />
                <span>{entry.feedTitle}</span>
              </motion.div>
              <motion.h1 variants={itemV} className="reader__title">
                {entry.title}
              </motion.h1>
            </motion.div>
          </div>
        )}

        <motion.article
          className={`reader__article${entry.image ? " reader__article--media" : ""}`}
          variants={containerV}
          initial="hidden"
          animate="show"
          exit="exit"
        >
          {!entry.image && (
            <>
              <motion.div
                variants={itemV}
                className="reader__kicker"
                style={{ "--feed": color } as React.CSSProperties}
              >
                <Favicon feedId={entry.feedId} />
                <span>{entry.feedTitle}</span>
              </motion.div>

              <motion.h1 variants={itemV} className="reader__title">
                {entry.title}
              </motion.h1>
            </>
          )}

          <motion.div variants={itemV} className="reader__byline">
            {author && (
              <>
                <span>
                  By <strong>{author}</strong>
                </span>
                <span className="dot" />
              </>
            )}
            <span>{fullDate(entry.publishedAt)}</span>
            {entry.readingTime > 0 && (
              <>
                <span className="dot" />
                <span>{readingTimeLabel(entry.readingTime)}</span>
              </>
            )}
            <button
              type="button"
              className="reader__fulltext-btn"
              onClick={() => (showingFull ? setShowingFull(false) : loadFull())}
              disabled={loadingFull}
            >
              {loadingFull ? (
                <Loader2 className="size-3.5 spin" />
              ) : showingFull ? (
                <Undo2 className="size-3.5" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {showingFull ? "Show summary" : "Read full article"}
            </button>
          </motion.div>

          <motion.div variants={itemV}>
          {isLoading && !baseHtml ? (
            <div className="article-body" aria-hidden>
              {[92, 100, 86, 96, 70, 100, 88].map((w, i) => (
                <div
                  key={i}
                  className="shimmer"
                  style={{
                    height: 18,
                    width: `${w}%`,
                    borderRadius: 6,
                    margin: "0 0 16px",
                  }}
                />
              ))}
            </div>
          ) : (
            <div
              className="article-body"
              dangerouslySetInnerHTML={{ __html: processed }}
            />
          )}
          </motion.div>
        </motion.article>
      </motion.div>
    </>
  );
}
