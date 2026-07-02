"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, MoreHorizontal, CheckCheck, Trash2 } from "lucide-react";
import type { Filter, CategoryNode, FeedNode } from "@/lib/types";
import { Favicon } from "@/components/Img";
import { feedColor } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ------------------------------------------------------------------ *
 *  Folder tree — draggable feeds + folders, imported from the        *
 *  "News Reader" design (turn 3a). Rows are absolutely positioned by  *
 *  a computed `top`; a CSS spring glides them as the layout reflows.  *
 *  Dragging a feed onto a folder lights the folder up as a drop box   *
 *  with an open slot; dropping across folders persists the move to    *
 *  Miniflux, while order within a folder is a browser-local concern.  *
 * ------------------------------------------------------------------ */

const HEADER_H = 34;
const FEED_H = 36;
const ROW_GAP = 2;
const FOLDER_GAP = 8; // breathing room after a folder's feeds
const DRAG_THRESHOLD = 5; // px before a press becomes a drag (so taps still click)

const LS_KEY = "sidebar-folder-order-v1";

interface SavedOrder {
  cats: number[];
  feeds: Record<string, number[]>;
}

interface Folder {
  catId: number;
  title: string;
  unread: number;
  feeds: FeedNode[];
}

type DragKind = "feed" | "folder";

interface DragState {
  kind: DragKind;
  id: number; // feedId or catId
  sourceCatId: number; // for a feed: its origin folder
  grabOffset: number; // pointerY(container) − rowY at grab
  pointerY: number; // current, in container coordinates
  started: boolean;
}

/* ---- persistence ---- */

function loadOrder(): SavedOrder {
  if (typeof window === "undefined") return { cats: [], feeds: {} };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { cats: [], feeds: {} };
    const p = JSON.parse(raw) as SavedOrder;
    return { cats: p.cats ?? [], feeds: p.feeds ?? {} };
  } catch {
    return { cats: [], feeds: {} };
  }
}

// Apply the saved order on top of the server tree. Unknown ids (newly added
// feeds/folders) fall in after the remembered ones, in the server's order.
function orderFolders(cats: CategoryNode[], saved: SavedOrder): Folder[] {
  const byId = new Map(cats.map((c) => [c.id, c] as const));
  const seen = new Set<number>();
  const ordered: CategoryNode[] = [];
  for (const id of saved.cats) {
    const c = byId.get(id);
    if (c) {
      ordered.push(c);
      seen.add(id);
    }
  }
  for (const c of cats) if (!seen.has(c.id)) ordered.push(c);

  return ordered.map((c) => {
    const order = saved.feeds[String(c.id)] ?? [];
    const fById = new Map(c.feeds.map((f) => [f.id, f] as const));
    const fseen = new Set<number>();
    const feeds: FeedNode[] = [];
    for (const fid of order) {
      const f = fById.get(fid);
      if (f) {
        feeds.push(f);
        fseen.add(fid);
      }
    }
    for (const f of c.feeds) if (!fseen.has(f.id)) feeds.push(f);
    return { catId: c.id, title: c.title, unread: c.unread, feeds };
  });
}

function orderToSaved(folders: Folder[]): SavedOrder {
  return {
    cats: folders.map((f) => f.catId),
    feeds: Object.fromEntries(folders.map((f) => [String(f.catId), f.feeds.map((x) => x.id)])),
  };
}

/* ---- layout ---- */

interface LayoutRow {
  key: string;
  kind: "header" | "feed";
  catId: number;
  feedId?: number;
  y: number;
  h: number;
}

function buildRows(folders: Folder[], expanded: (catId: number) => boolean): {
  rows: LayoutRow[];
  height: number;
  regions: Map<number, { top: number; bottom: number }>;
} {
  const rows: LayoutRow[] = [];
  const regions = new Map<number, { top: number; bottom: number }>();
  let y = 0;
  for (const f of folders) {
    const top = y;
    rows.push({ key: `h-${f.catId}`, kind: "header", catId: f.catId, y, h: HEADER_H });
    y += HEADER_H + ROW_GAP;
    if (expanded(f.catId)) {
      for (const feed of f.feeds) {
        rows.push({
          key: `f-${feed.id}`,
          kind: "feed",
          catId: f.catId,
          feedId: feed.id,
          y,
          h: FEED_H,
        });
        y += FEED_H + ROW_GAP;
      }
    }
    regions.set(f.catId, { top, bottom: y });
    y += FOLDER_GAP;
  }
  return { rows, height: Math.max(0, y - FOLDER_GAP), regions };
}

interface FolderTreeProps {
  categories: CategoryNode[];
  filter: Filter;
  onSelectFeed: (feed: FeedNode) => void;
  onMarkFeedRead: (feedId: number) => void;
  onRemoveFeed: (feed: FeedNode) => void;
  onMoveFeed: (feedId: number, toCatId: number) => void;
}

export function FolderTree({
  categories,
  filter,
  onSelectFeed,
  onMarkFeedRead,
  onRemoveFeed,
  onMoveFeed,
}: FolderTreeProps) {
  // Lazily read the saved order from localStorage. FolderTree only renders once
  // the SWR feeds tree has loaded (client-side), so there's no SSR pass to skew.
  const [order, setOrder] = useState<SavedOrder>(loadOrder);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // A real drag ends with a browser `click` on the lifted row — swallow that one
  // click so a drag doesn't also select the feed / toggle the folder.
  const didDragRef = useRef(false);

  const folders = useMemo(() => orderFolders(categories, order), [categories, order]);

  const persist = useCallback((next: Folder[]) => {
    const saved = orderToSaved(next);
    setOrder(saved);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(saved));
    } catch {
      /* storage full / disabled — ordering just won't survive a reload */
    }
  }, []);

  const isExpandedBase = useCallback(
    (catId: number) => !collapsed.has(catId),
    [collapsed]
  );

  // Committed geometry, used to hit-test the pointer to a folder + slot. Stable
  // through a drag (independent of where the pointer currently is).
  const base = useMemo(() => buildRows(folders, isExpandedBase), [folders, isExpandedBase]);

  // Work out where the drag would land right now, and the projected folder list.
  // `expandTarget` is a collapsed folder being hovered by a feed — opened live so
  // the drop slot shows (and it stays open after the drop).
  const projection = useMemo(() => {
    const idle = {
      folders,
      dropCatId: null as number | null,
      floatKey: null as string | null,
      expandTarget: null as number | null,
    };
    if (!drag || !drag.started) return idle;
    const py = drag.pointerY;

    if (drag.kind === "feed") {
      const dragged = folders.flatMap((f) => f.feeds).find((x) => x.id === drag.id);
      if (!dragged) return idle;

      // Which folder is the pointer over? (clamped to first/last)
      let dropCatId = folders[0]?.catId ?? drag.sourceCatId;
      for (const f of folders) {
        const r = base.regions.get(f.catId);
        if (r && py >= r.top) dropCatId = f.catId;
      }
      const targetCollapsed = collapsed.has(dropCatId);

      // Remove the dragged feed, then insert it into the target folder at the
      // slot nearest the pointer (by base-layout feed midpoints).
      const stripped: Folder[] = folders.map((f) => ({
        ...f,
        feeds: f.feeds.filter((x) => x.id !== drag.id),
      }));

      let insertIdx = 0;
      if (!targetCollapsed) {
        const target = stripped.find((f) => f.catId === dropCatId);
        for (const feed of target?.feeds ?? []) {
          const row = base.rows.find((r) => r.feedId === feed.id);
          if (row && py > row.y + row.h / 2) insertIdx++;
        }
      } else {
        // Collapsed target: land at the end when it opens.
        insertIdx = stripped.find((f) => f.catId === dropCatId)?.feeds.length ?? 0;
      }

      const projected = stripped.map((f) =>
        f.catId === dropCatId
          ? { ...f, feeds: [...f.feeds.slice(0, insertIdx), dragged, ...f.feeds.slice(insertIdx)] }
          : f
      );
      return {
        folders: projected,
        dropCatId,
        floatKey: `f-${drag.id}`,
        expandTarget: targetCollapsed ? dropCatId : null,
      };
    }

    // Folder drag: reorder whole channels by header midpoints.
    const dragged = folders.find((f) => f.catId === drag.id);
    if (!dragged) return idle;
    const others = folders.filter((f) => f.catId !== drag.id);
    let insertIdx = 0;
    for (const f of others) {
      const r = base.regions.get(f.catId);
      if (r && py > (r.top + r.bottom) / 2) insertIdx++;
    }
    const projected = [...others.slice(0, insertIdx), dragged, ...others.slice(insertIdx)];
    return { folders: projected, dropCatId: null, floatKey: `h-${drag.id}`, expandTarget: null };
  }, [drag, folders, base, collapsed]);

  // Layout of the projected order. A dragged feed's target folder is force-open
  // (so the slot shows); a dragged folder is force-collapsed (only its header
  // travels).
  const expandTarget = projection.expandTarget;
  const isExpandedProjected = useCallback(
    (catId: number) => {
      if (drag?.started && drag.kind === "folder" && catId === drag.id) return false;
      if (catId === expandTarget) return true;
      return !collapsed.has(catId);
    },
    [drag, collapsed, expandTarget]
  );

  const layout = useMemo(
    () => buildRows(projection.folders, isExpandedProjected),
    [projection.folders, isExpandedProjected]
  );

  // Drop-box highlight rect: the whole target folder, lit while a feed hovers it.
  const dropBox = useMemo(() => {
    if (!drag?.started || drag.kind !== "feed" || projection.dropCatId == null) return null;
    const r = layout.regions.get(projection.dropCatId);
    return r ? { top: r.top, height: r.bottom - r.top } : null;
  }, [drag, projection.dropCatId, layout]);

  /* ---- pointer drag ---- */

  const containerY = (clientY: number) => {
    const top = containerRef.current?.getBoundingClientRect().top ?? 0;
    return clientY - top;
  };

  // Latest projection, so the (stable) finalizer can read where the drag landed.
  // Written in an effect (not during render) to satisfy the refs-in-render rule.
  const projectionRef = useRef(projection);
  useEffect(() => {
    projectionRef.current = projection;
  });
  const startClientYRef = useRef(0);

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d || !d.started) return;
    didDragRef.current = true; // suppress the click the browser fires next

    // Commit the projected order. For a feed that changed folders, persist the
    // move to Miniflux (membership is server-side; order stays browser-local).
    const projected = projectionRef.current.folders;
    const landedIn = projected.find((f) => f.feeds.some((x) => x.id === d.id));
    if (d.kind === "feed" && landedIn && landedIn.catId !== d.sourceCatId) {
      onMoveFeed(d.id, landedIn.catId);
    }
    persist(projected);
    // A collapsed folder we dropped a feed into stays open to reveal it.
    if (d.kind === "feed" && landedIn) {
      setCollapsed((prev) => {
        if (!prev.has(landedIn.catId)) return prev;
        const next = new Set(prev);
        next.delete(landedIn.catId);
        return next;
      });
    }
  }, [persist, onMoveFeed]);

  // Window listeners run for the life of a drag; handlers read from refs so the
  // subscription is set up once per drag, not re-bound on every pointer move.
  const dragActive = drag !== null;
  useEffect(() => {
    if (!dragActive) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const started = d.started || Math.abs(e.clientY - startClientYRef.current) >= DRAG_THRESHOLD;
      const next: DragState = { ...d, pointerY: containerY(e.clientY), started };
      dragRef.current = next;
      setDrag(next);
      if (started) e.preventDefault();
    };
    const onUp = () => endDrag();
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragActive, endDrag]);

  const startDrag = (
    e: React.PointerEvent,
    kind: DragKind,
    id: number,
    sourceCatId: number,
    rowY: number
  ) => {
    if (e.button !== 0) return;
    const py = containerY(e.clientY);
    startClientYRef.current = e.clientY;
    didDragRef.current = false;
    const d: DragState = {
      kind,
      id,
      sourceCatId,
      grabOffset: py - rowY,
      pointerY: py,
      started: false,
    };
    dragRef.current = d;
    setDrag(d);
  };

  const toggleCollapse = (catId: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });

  const feedById = useMemo(() => {
    const m = new Map<number, FeedNode>();
    for (const f of folders) for (const fe of f.feeds) m.set(fe.id, fe);
    return m;
  }, [folders]);
  const folderById = useMemo(() => {
    const m = new Map<number, Folder>();
    for (const f of folders) m.set(f.catId, f);
    return m;
  }, [folders]);

  const activeFeedId = filter.kind === "feed" ? filter.id : undefined;

  return (
    <div
      ref={containerRef}
      className="ftree"
      style={{ height: layout.height }}
      data-dragging={drag?.started || undefined}
    >
      {dropBox && (
        <div className="ftree__dropbox" style={{ top: dropBox.top, height: dropBox.height }} />
      )}

      {layout.rows.map((row) => {
        const isDragged = row.key === projection.floatKey && drag?.started;
        const y = isDragged && drag ? drag.pointerY - drag.grabOffset : row.y;

        if (row.kind === "header") {
          const folder = folderById.get(row.catId);
          if (!folder) return null;
          const isCollapsed = collapsed.has(row.catId);
          return (
            <div
              key={row.key}
              className="ftree__row ftree__header"
              data-dragged={isDragged || undefined}
              style={{ top: y, height: row.h, zIndex: isDragged ? 30 : 2 }}
              onPointerDown={(e) => startDrag(e, "folder", row.catId, row.catId, row.y)}
              onClick={() => {
                if (didDragRef.current) {
                  didDragRef.current = false;
                  return;
                }
                toggleCollapse(row.catId);
              }}
            >
              <ChevronRight
                className="ftree__chev"
                size={13}
                style={{ transform: isCollapsed ? "none" : "rotate(90deg)" }}
              />
              <span className="ftree__hname">{folder.title}</span>
              <span className="ftree__hcount">
                {folder.feeds.length} {folder.feeds.length === 1 ? "feed" : "feeds"}
              </span>
              {folder.unread > 0 && <span className="ftree__unread">{folder.unread}</span>}
            </div>
          );
        }

        const feed = feedById.get(row.feedId!);
        if (!feed) return null;
        const active = feed.id === activeFeedId;
        return (
          <div
            key={row.key}
            className="ftree__row ftree__feed"
            data-active={active || undefined}
            data-dragged={isDragged || undefined}
            style={
              {
                top: y,
                height: row.h,
                zIndex: isDragged ? 30 : 3,
                "--feed": feedColor(feed.id),
              } as React.CSSProperties
            }
            onPointerDown={(e) => startDrag(e, "feed", feed.id, row.catId, row.y)}
            onClick={() => {
              if (didDragRef.current) {
                didDragRef.current = false;
                return;
              }
              onSelectFeed(feed);
            }}
          >
            <span className="ftree__avatar" data-letter={(feed.title || "•").slice(0, 1).toUpperCase()}>
              <Favicon feedId={feed.id} className="ftree__favicon" />
            </span>
            <span className="ftree__fname">{feed.title}</span>
            {feed.unread > 0 && <span className="ftree__unread ftree__unread--feed">{feed.unread}</span>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ftree__more"
                  aria-label="Feed options"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                <DropdownMenuItem onClick={() => onMarkFeedRead(feed.id)}>
                  <CheckCheck className="size-4" />
                  Mark all as read
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onRemoveFeed(feed)}
                >
                  <Trash2 className="size-4" />
                  Remove feed
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}
