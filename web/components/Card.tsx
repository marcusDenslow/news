"use client";

import { motion } from "motion/react";
import { Star } from "lucide-react";
import type { CardEntry } from "@/lib/types";
import { feedColor, relativeTime } from "@/lib/format";
import { Favicon, MediaImg } from "@/components/Img";

const EASE = [0.22, 1, 0.36, 1] as const;

interface CardProps {
  entry: CardEntry;
  index: number;
  onOpen: (entry: CardEntry) => void;
  onToggleStar: (entry: CardEntry) => void;
}

function activateOnKey(handler: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler();
    }
  };
}

export function Card({ entry, index, onOpen, onToggleStar }: CardProps) {
  const hasImage = Boolean(entry.image);
  const open = () => onOpen(entry);

  return (
    <motion.article
      className={`card ${hasImage ? "card--image" : "card--text"}`}
      data-read={entry.status === "read"}
      data-initial={(entry.feedTitle || "•").slice(0, 1).toUpperCase()}
      style={{ "--feed": feedColor(entry.feedId) } as React.CSSProperties}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.5, ease: EASE, delay: (index % 10) * 0.025 }}
      onClick={open}
      onKeyDown={activateOnKey(open)}
      role="button"
      tabIndex={0}
    >
      {hasImage && (
        <motion.div className="card__media" layoutId={`media-${entry.id}`}>
          <MediaImg src={entry.image!} />
        </motion.div>
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
    </motion.article>
  );
}

export function Hero({ entry, onOpen }: { entry: CardEntry; onOpen: (e: CardEntry) => void }) {
  const hasImage = Boolean(entry.image);
  const open = () => onOpen(entry);
  const color = feedColor(entry.feedId);

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
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE }}
      onClick={open}
      onKeyDown={activateOnKey(open)}
      role="button"
      tabIndex={0}
    >
      <motion.div className="hero__media" layoutId={`media-${entry.id}`}>
        <MediaImg src={entry.image!} eager />
        <div className="hero__scrim" />
      </motion.div>
      <div className="hero__content">
        {source}
        <h1 className="hero__title line-clamp-3">{entry.title}</h1>
        {entry.excerpt && <p className="hero__excerpt line-clamp-2">{entry.excerpt}</p>}
        {meta}
      </div>
    </motion.article>
  );
}
