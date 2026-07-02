"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
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
  Headphones,
  Square,
} from "lucide-react";
import type { CardEntry, FullEntry } from "@/lib/types";
import { imgProxy, readingTimeLabel, jsonFetcher } from "@/lib/format";
import { MediaImg } from "@/components/Img";

const EASE = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.4, 0, 0.28, 1] as const;

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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

  // ---- Hero parallax --------------------------------------------------------
  // The image layer lags the scroll (translates down + scales up) as the hero
  // slides out of view. Measured against the hero *wrapper* (a stable flow box);
  // the inner hero morphs via FLIP, so it can't be the scroll target.
  const herowrapRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroP } = useScroll({
    target: herowrapRef,
    container: scrollRef,
    offset: ["start start", "end start"],
  });
  const heroY = useTransform(heroP, [0, 1], [0, 140]);
  const heroScale = useTransform(heroP, [0, 1], [1.06, 1.16]);

  // ---- Single-element hero morph -------------------------------------------
  // One box flies from the card's on-screen rect into the full-bleed hero and
  // back. No shared-layout crossfade — there is only ever this one element in
  // flight, so the eye tracks it cleanly. The page is scroll-locked while open,
  // so the captured `origin` rect stays valid for the collapse on close.
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
        // as ~16px (the card radius) at the shrunk end, 0 at the full-bleed end.
        borderRadius: [`${16 / flip.sx}px`, "0px"],
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
        borderRadius: ["0px", `${16 / flip.sx}px`],
      },
      { duration: 0.44, ease: EASE_IN }
    ).then(() => safeToRemove?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  // Headline + body settle in after the hero has begun its flight, then leave in
  // a quick downward cascade. Reduced motion collapses it all to a plain cut.
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
  const [speaking, setSpeaking] = useState(false);

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

  // Never leave the article reading aloud after the reader is gone.
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

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

  // Vocal reader — native Web Speech API (SpeechSynthesis). Zero-dependency
  // baseline; reads the currently displayed text (summary or full article).
  function toggleListen() {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const tmp = document.createElement("div");
    tmp.innerHTML = processed;
    const text = `${entry.title}. ${tmp.textContent ?? ""}`.replace(/\s+/g, " ").trim();
    if (!text) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(utter);
    setSpeaking(true);
  }

  const author = entry.author?.trim();
  const heroImgStyle = reduce ? undefined : { y: heroY, scale: heroScale };

  const Meta = (
    <>
      <motion.div variants={itemV} className="reader__cine-kicker">
        <span>{entry.feedTitle}</span>
        <span className="rule" />
      </motion.div>
      <motion.h1 variants={itemV} className="reader__cine-title">
        {entry.title}
      </motion.h1>
      <motion.div variants={itemV} className="reader__cine-byline">
        <span className="reader__cine-avatar" aria-hidden />
        {author && (
          <>
            <span>{author}</span>
            <span className="dot" />
          </>
        )}
        {entry.readingTime > 0 && (
          <>
            <span>{readingTimeLabel(entry.readingTime)}</span>
            <span className="dot" />
          </>
        )}
        <span>{shortDate(entry.publishedAt)}</span>
      </motion.div>
    </>
  );

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

      <motion.div className="reader reader--cine" ref={scrollRef}>
        <motion.div className="reader__progress" style={{ scaleX: scrollYProgress }} />

        {/* Floating glass controls, over the hero. Back on the left; a vertical
            action rail on the right (Listen / Bookmark / Open). */}
        <motion.div
          className="reader__cine-bar"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            className="reader__cine-gbtn"
            onClick={onClose}
            aria-label="Back"
            title="Back (Esc)"
          >
            <ArrowLeft className="size-[18px]" />
          </button>

          <div className="reader__cine-rail">
            <button
              type="button"
              className="reader__cine-railbtn"
              data-on={speaking || undefined}
              data-label={speaking ? "Stop" : "Listen"}
              onClick={toggleListen}
              aria-pressed={speaking}
              aria-label={speaking ? "Stop reading" : "Listen"}
            >
              {speaking ? (
                <Square className="size-[15px]" fill="currentColor" />
              ) : (
                <Headphones className="size-[18px]" />
              )}
            </button>
            <button
              type="button"
              className="reader__cine-railbtn"
              data-on={entry.starred || undefined}
              data-label={entry.starred ? "Bookmarked" : "Bookmark"}
              onClick={() => onToggleStar(entry)}
              aria-label={entry.starred ? "Bookmarked" : "Bookmark"}
            >
              <Star className="size-[18px]" fill={entry.starred ? "currentColor" : "none"} />
            </button>
            <a
              className="reader__cine-railbtn"
              data-label="Open original"
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open original"
            >
              <ExternalLink className="size-[17px]" />
            </a>
          </div>
        </motion.div>

        {entry.image ? (
          <div className="reader__cine-herowrap" ref={herowrapRef}>
            {/* Morphs from the card rect (see the layout effects). Plain div — it
                must not be under Motion's layout system or the flight fights the
                projection. */}
            <div className="reader__cine-hero" ref={heroRef}>
              <motion.div className="reader__cine-heroimg" style={heroImgStyle}>
                <MediaImg src={entry.image} eager />
              </motion.div>
              <div className="reader__cine-scrim" />
            </div>
            <motion.div
              className="reader__cine-meta"
              variants={containerV}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              {Meta}
            </motion.div>
          </div>
        ) : (
          <motion.div
            className="reader__cine-txthead"
            variants={containerV}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            {Meta}
          </motion.div>
        )}

        <motion.article
          className="reader__cine-article"
          variants={containerV}
          initial="hidden"
          animate="show"
          exit="exit"
        >
          <motion.div variants={itemV} className="reader__cine-tools">
            <button
              type="button"
              className="reader__cine-fulltext"
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
                    style={{ height: 18, width: `${w}%`, borderRadius: 6, margin: "0 0 16px" }}
                  />
                ))}
              </div>
            ) : (
              <div className="article-body" dangerouslySetInnerHTML={{ __html: processed }} />
            )}
          </motion.div>
        </motion.article>
      </motion.div>
    </>
  );
}
