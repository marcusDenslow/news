"use client";

/* Resilient <img> wrappers: hide gracefully instead of showing a broken-image
   glyph when a remote favicon or article image fails (hotlink blocks, 404s). */

import { imgProxy, faviconUrl } from "@/lib/format";

const hide = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.visibility = "hidden";
};

export function Favicon({ feedId, className }: { feedId: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={faviconUrl(feedId)} alt="" loading="lazy" onError={hide} />
  );
}

export function MediaImg({
  src,
  eager,
}: {
  src: string;
  eager?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imgProxy(src)}
      alt=""
      decoding="async"
      loading={eager ? undefined : "lazy"}
      onError={(e) => {
        // Collapse the media slot so the card/hero degrades cleanly.
        e.currentTarget.style.display = "none";
        e.currentTarget.parentElement?.setAttribute("data-failed", "true");
      }}
    />
  );
}
