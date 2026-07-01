"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll } from "motion/react";
import useSWR from "swr";
import {
  X,
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
  onClose: () => void;
  onToggleStar: (entry: CardEntry) => void;
}

export function Reader({ entry, onClose, onToggleStar }: ReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: scrollRef });

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
        transition={{ duration: 0.28, ease: "easeOut" }}
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
              <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
                <X className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close (Esc)</TooltipContent>
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
          <motion.div className="reader__hero" layoutId={`media-${entry.id}`}>
            <MediaImg src={entry.image} eager />
          </motion.div>
        )}

        <motion.article
          className="reader__article"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.06 }}
        >
          <div className="reader__kicker" style={{ "--feed": color } as React.CSSProperties}>
            <Favicon feedId={entry.feedId} />
            <span>{entry.feedTitle}</span>
          </div>

          <h1 className="reader__title">{entry.title}</h1>

          <div className="reader__byline">
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
          </div>

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
        </motion.article>
      </motion.div>
    </>
  );
}
