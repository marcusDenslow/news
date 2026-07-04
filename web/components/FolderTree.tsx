"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, CheckCheck, Trash2, FolderMinus } from "lucide-react";
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
 *  Nested folder tree — imported from the "News Reader" design (3a).  *
 *  Folders hold feeds AND other folders, any depth. Rows are laid out *
 *  in a FIXED dom order and positioned by a computed `top` + indent,  *
 *  so every reflow (drag, collapse, nest) glides via CSS springs.     *
 *                                                                     *
 *  Miniflux categories are flat, so folder-under-folder NESTING is a  *
 *  browser-local concern (localStorage). A feed always belongs to a   *
 *  real category = its immediate parent folder; dragging a feed into  *
 *  another folder persists that membership move to Miniflux, while    *
 *  order + nesting stay local.                                        *
 * ------------------------------------------------------------------ */

const ROW_H = 36;
const GROUP_GAP = 8; // breathing room before each top-level folder
const INDENT = 15; // px added per depth level
const BASE_PAD = 12; // left padding at depth 0
const DRAG_THRESHOLD = 4; // px before a press becomes a drag (so taps still click)
// A folder only claims the dragged item once its center passes the folder
// header's MIDPOINT (not its top edge) — so you must drag onto a folder's row
// before it becomes the drop target, instead of it grabbing at the boundary.
const ENTER_MARGIN = ROW_H / 2;

const LS_KEY = "sidebar-tree-v2";

/* ---- working tree ---- */

type Kind = "header" | "feed";

interface TNode {
  key: string; // "h:<catId>" | "f:<feedId>"
  kind: Kind;
  catId: number; // header: own id; feed: its parent category id
  feedId?: number;
  children: TNode[]; // headers only
}

interface SavedNode {
  id: string;
  children?: SavedNode[];
}

/* ---- persistence ---- */

function loadSaved(): SavedNode[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? (p as SavedNode[]) : [];
  } catch {
    return [];
  }
}

function serialize(nodes: TNode[]): SavedNode[] {
  return nodes.map((n) =>
    n.kind === "header" ? { id: n.key, children: serialize(n.children) } : { id: n.key }
  );
}

// Reconcile the server tree (flat categories → feeds) with the saved nesting +
// order. Unknown ids are dropped; new folders land at root, new feeds at the end
// of their category; a feed that the server moved out from under its saved parent
// is re-homed under its real category.
function build(categories: CategoryNode[], saved: SavedNode[]): TNode[] {
  const catById = new Map<number, CategoryNode>();
  const feedCat = new Map<number, number>();
  const feedExists = new Set<number>();
  for (const c of categories) {
    catById.set(c.id, c);
    for (const f of c.feeds) {
      feedCat.set(f.id, c.id);
      feedExists.add(f.id);
    }
  }

  const placedCats = new Set<number>();
  const placedFeeds = new Set<number>();

  const convert = (nodes: SavedNode[], parentCat: number | null): TNode[] => {
    const out: TNode[] = [];
    for (const n of nodes) {
      if (n.id.startsWith("h:")) {
        const catId = Number(n.id.slice(2));
        if (!catById.has(catId) || placedCats.has(catId)) continue;
        placedCats.add(catId);
        out.push({
          key: `h:${catId}`,
          kind: "header",
          catId,
          children: convert(n.children ?? [], catId),
        });
      } else if (n.id.startsWith("f:")) {
        const feedId = Number(n.id.slice(2));
        if (!feedExists.has(feedId) || placedFeeds.has(feedId)) continue;
        if (feedCat.get(feedId) !== parentCat) continue; // re-homed below
        placedFeeds.add(feedId);
        out.push({ key: `f:${feedId}`, kind: "feed", catId: parentCat!, feedId, children: [] });
      }
    }
    return out;
  };

  const roots = convert(saved, null);

  // Append each folder's server feeds that weren't already placed (server order).
  const fill = (node: TNode) => {
    if (node.kind !== "header") return;
    for (const c of node.children) fill(c);
    const cat = catById.get(node.catId);
    if (!cat) return;
    for (const f of cat.feeds) {
      if (placedFeeds.has(f.id)) continue;
      placedFeeds.add(f.id);
      node.children.push({ key: `f:${f.id}`, kind: "feed", catId: node.catId, feedId: f.id, children: [] });
    }
  };
  for (const r of roots) fill(r);

  // New categories → root folders with their feeds.
  for (const cat of categories) {
    if (placedCats.has(cat.id)) continue;
    placedCats.add(cat.id);
    const header: TNode = { key: `h:${cat.id}`, kind: "header", catId: cat.id, children: [] };
    for (const f of cat.feeds) {
      placedFeeds.add(f.id);
      header.children.push({ key: `f:${f.id}`, kind: "feed", catId: cat.id, feedId: f.id, children: [] });
    }
    roots.push(header);
  }
  return roots;
}

/* ---- layout ---- */

interface Pos {
  y: number;
  depth: number;
  hidden: boolean;
}
interface OrderEntry {
  key: string;
  kind: Kind;
  catId: number;
  feedId?: number;
  depth: number;
  hidden: boolean;
}
interface Meta {
  feeds: number;
  unread: number;
}

// Flatten the tree → y + depth for every node (fixed 36px rows). Collapsed
// folders park their descendants at the header's y (hidden) so they animate
// out/in instead of popping.
function layout(tree: TNode[], isOpen: (catId: number) => boolean, unreadOf: (feedId: number) => number) {
  const pos = new Map<string, Pos>();
  const order: OrderEntry[] = [];
  const meta = new Map<number, Meta>();
  let y = 0;
  let firstTop = true;

  const walk = (nodes: TNode[], depth: number, visible: boolean, collapseY: number) => {
    for (const n of nodes) {
      let myY: number;
      if (visible) {
        if (depth === 0 && !firstTop) y += GROUP_GAP;
        if (depth === 0) firstTop = false;
        myY = y;
        pos.set(n.key, { y, depth, hidden: false });
        order.push({ key: n.key, kind: n.kind, catId: n.catId, feedId: n.feedId, depth, hidden: false });
        y += ROW_H;
      } else {
        myY = collapseY;
        pos.set(n.key, { y: collapseY, depth, hidden: true });
        order.push({ key: n.key, kind: n.kind, catId: n.catId, feedId: n.feedId, depth, hidden: true });
      }
      if (n.kind === "header") {
        const childVisible = visible && isOpen(n.catId);
        walk(n.children, depth + 1, childVisible, childVisible ? 0 : myY);
      }
    }
  };
  walk(tree, 0, true, 0);

  const count = (n: TNode): Meta => {
    if (n.kind === "feed") return { feeds: 1, unread: unreadOf(n.feedId!) };
    let feeds = 0;
    let unread = 0;
    for (const c of n.children) {
      const r = count(c);
      feeds += r.feeds;
      unread += r.unread;
    }
    meta.set(n.catId, { feeds, unread });
    return { feeds, unread };
  };
  for (const n of tree) count(n);

  return { pos, order, height: y, meta };
}

// Region [top, bottom] enclosing a folder + all its visible descendants.
function regionOf(order: OrderEntry[], pos: Map<string, Pos>, catId: number) {
  const idx = order.findIndex((o) => o.key === `h:${catId}`);
  if (idx < 0) return { top: 0, bottom: 0 };
  const pd = order[idx].depth;
  let bottom = pos.get(`h:${catId}`)!.y + ROW_H;
  for (let j = idx + 1; j < order.length; j++) {
    if (order[j].depth <= pd) break;
    if (!order[j].hidden) bottom = pos.get(order[j].key)!.y + ROW_H;
  }
  return { top: pos.get(`h:${catId}`)!.y, bottom: Math.max(pos.get(`h:${catId}`)!.y + ROW_H, bottom) };
}

/* ---- immutable tree helpers ---- */

function removeNode(nodes: TNode[], key: string): { tree: TNode[]; node: TNode | null } {
  const out: TNode[] = [];
  let found: TNode | null = null;
  for (const n of nodes) {
    if (n.key === key) {
      found = n;
      continue;
    }
    if (n.children.length) {
      const r = removeNode(n.children, key);
      if (r.node) {
        found = r.node;
        out.push({ ...n, children: r.tree });
        continue;
      }
    }
    out.push(n);
  }
  return { tree: out, node: found };
}

function insertNode(nodes: TNode[], parentCat: number | null, index: number, node: TNode): TNode[] {
  if (parentCat === null) {
    const out = nodes.slice();
    out.splice(index, 0, node);
    return out;
  }
  return nodes.map((n) => {
    if (n.kind === "header" && n.catId === parentCat) {
      const ch = n.children.slice();
      ch.splice(index, 0, node);
      return { ...n, children: ch };
    }
    if (n.children.length) return { ...n, children: insertNode(n.children, parentCat, index, node) };
    return n;
  });
}

function findHeader(nodes: TNode[], catId: number): TNode | null {
  for (const n of nodes) {
    if (n.kind === "header" && n.catId === catId) return n;
    if (n.children.length) {
      const r = findHeader(n.children, catId);
      if (r) return r;
    }
  }
  return null;
}

/* ---- drag ---- */

interface DragState {
  key: string;
  kind: Kind;
  catId: number; // header: own; feed: current parent (source)
  feedId?: number;
  sourceCat: number;
  startClientY: number;
  startY: number; // container y of the row at grab
  pointerY: number; // startY + dy — top of the floating row, in container coords
  started: boolean;
}

// Region-based nesting: vertical position vs. folder regions decides where the
// item lands. The deepest visible folder whose region encloses the cursor
// becomes the parent, so dragging into a folder's area nests deeper; crossing
// its bottom edge pops back out to the enclosing group.
function computeMove(
  tree: TNode[],
  drag: DragState,
  isOpen: (catId: number) => boolean,
  unreadOf: (feedId: number) => number
): { tree: TNode[]; over: number | null } | null {
  const { tree: rest, node } = removeNode(tree, drag.key);
  if (!node) return null;
  const { pos, order } = layout(rest, isOpen, unreadOf);
  const center = drag.pointerY + ROW_H / 2;

  let parentCat: number | null = null;
  let parentDepth = -1;
  for (const o of order) {
    if (o.hidden || o.kind !== "header") continue;
    const top = pos.get(o.key)!.y;
    const { bottom } = regionOf(order, pos, o.catId);
    if (center >= top + ENTER_MARGIN && center < bottom && o.depth > parentDepth) {
      parentCat = o.catId;
      parentDepth = o.depth;
    }
  }

  // Feeds must live inside a real category — never at root. If the cursor is over
  // no folder, keep the feed in its source folder (a no-op move).
  if (drag.kind === "feed" && parentCat === null) parentCat = drag.sourceCat;

  const siblings = parentCat !== null ? findHeader(rest, parentCat)?.children ?? [] : rest;
  let index = 0;
  for (const s of siblings) {
    const sp = pos.get(s.key);
    if (!sp || sp.hidden) continue;
    const bottom = s.kind === "header" ? regionOf(order, pos, s.catId).bottom : sp.y + ROW_H;
    if (center >= bottom - ROW_H / 2) index++;
  }

  return { tree: insertNode(rest, parentCat, index, node), over: parentCat };
}

/* ---- component ---- */

interface FolderTreeProps {
  categories: CategoryNode[];
  filter: Filter;
  onSelectFeed: (feed: FeedNode) => void;
  onMarkFeedRead: (feedId: number) => void;
  onRemoveFeed: (feed: FeedNode) => void;
  onMoveFeed: (feedId: number, toCatId: number) => void;
  onMarkFolderRead: (catId: number) => void;
  onDeleteFolder: (catId: number, withFeeds: boolean) => void;
}

export function FolderTree({
  categories,
  filter,
  onSelectFeed,
  onMarkFeedRead,
  onRemoveFeed,
  onMoveFeed,
  onMarkFolderRead,
  onDeleteFolder,
}: FolderTreeProps) {
  const [saved, setSaved] = useState<SavedNode[]>(loadSaved);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropFx, setDropFx] = useState<{ top: number; height: number; n: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const didDragRef = useRef(false);

  // Server metadata lookups (title, favicon color, per-feed/-cat unread).
  const feedMeta = useMemo(() => {
    const m = new Map<number, FeedNode>();
    for (const c of categories) for (const f of c.feeds) m.set(f.id, f);
    return m;
  }, [categories]);
  const catTitle = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of categories) m.set(c.id, c.title);
    return m;
  }, [categories]);
  const unreadOf = useCallback((feedId: number) => feedMeta.get(feedId)?.unread ?? 0, [feedMeta]);

  const tree = useMemo(() => build(categories, saved), [categories, saved]);

  const persist = useCallback((next: TNode[]) => {
    const s = serialize(next);
    setSaved(s);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(s));
    } catch {
      /* storage full / disabled — nesting just won't survive a reload */
    }
  }, []);

  const isOpenBase = useCallback((catId: number) => !collapsed.has(catId), [collapsed]);

  // A dragged folder rides alone — its subtree collapses so only the header floats.
  const draggedFolder = drag?.started && drag.kind === "header" ? drag.catId : null;
  const isOpenProjected = useCallback(
    (catId: number) => (catId === draggedFolder ? false : !collapsed.has(catId)),
    [collapsed, draggedFolder]
  );

  // Where the drag would land, and the projected tree.
  const projection = useMemo(() => {
    if (!drag?.started) return { tree, over: null as number | null };
    const res = computeMove(tree, drag, isOpenBase, unreadOf);
    return res ?? { tree, over: null };
  }, [drag, tree, isOpenBase, unreadOf]);

  const projLayout = useMemo(
    () => layout(projection.tree, isOpenProjected, unreadOf),
    [projection.tree, isOpenProjected, unreadOf]
  );

  // Render in a STABLE dom order (sorted by the node's own id, which never
  // depends on tree position) so React keeps each keyed node put as the layout
  // reflows — every move then animates via top + padding instead of the browser
  // dropping the transition when a node reorders in the DOM. Visual order is
  // carried entirely by each row's `top`.
  const renderKeys = useMemo(
    () => [...projLayout.order].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    [projLayout]
  );

  // Drop-box highlight: the whole target folder, lit while dragging over it.
  const dropBox = useMemo(() => {
    if (!drag?.started || projection.over == null) return null;
    const r = regionOf(projLayout.order, projLayout.pos, projection.over);
    return { top: r.top, height: r.bottom - r.top };
  }, [drag, projection.over, projLayout]);

  /* ---- pointer drag ---- */

  const projectionRef = useRef(projection);
  useEffect(() => {
    projectionRef.current = projection;
  });

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d || !d.started) return;
    didDragRef.current = true;

    const proj = projectionRef.current;
    const landed = proj.over;
    // Feed changed folders → persist the membership move to Miniflux.
    if (d.kind === "feed" && landed != null && landed !== d.sourceCat) {
      onMoveFeed(d.feedId!, landed);
    }
    persist(proj.tree);
    // Dropped into a collapsed folder → open it so the item shows.
    if (landed != null && collapsed.has(landed)) {
      setCollapsed((prev) => {
        const n = new Set(prev);
        n.delete(landed);
        return n;
      });
    }
    // Freeze the highlight so it plays a confirm bounce in place instead of
    // collapsing to the top as it fades.
    if (landed != null) {
      const lay = layout(proj.tree, (id) => id === landed || !collapsed.has(id), unreadOf);
      const r = regionOf(lay.order, lay.pos, landed);
      const n = Math.random();
      setDropFx({ top: r.top, height: r.bottom - r.top, n });
      window.setTimeout(() => setDropFx((f) => (f && f.n === n ? null : f)), 470);
    }
  }, [persist, onMoveFeed, collapsed, unreadOf]);

  const dragActive = drag !== null;
  useEffect(() => {
    if (!dragActive) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const started = d.started || Math.abs(e.clientY - d.startClientY) >= DRAG_THRESHOLD;
      const next: DragState = {
        ...d,
        pointerY: d.startY + (e.clientY - d.startClientY),
        started,
      };
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

  const startDrag = (e: React.PointerEvent, entry: OrderEntry, rowY: number) => {
    if (e.button !== 0) return;
    didDragRef.current = false;
    const d: DragState = {
      key: entry.key,
      kind: entry.kind,
      catId: entry.catId,
      feedId: entry.feedId,
      sourceCat: entry.catId,
      startClientY: e.clientY,
      startY: rowY,
      pointerY: rowY,
      started: false,
    };
    dragRef.current = d;
    setDrag(d);
  };

  const toggleCollapse = (catId: number) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(catId)) n.delete(catId);
      else n.add(catId);
      return n;
    });

  const activeFeedId = filter.kind === "feed" ? filter.id : undefined;
  const posByKey = projLayout.pos;
  const entryByKey = useMemo(() => {
    const m = new Map<string, OrderEntry>();
    for (const o of projLayout.order) m.set(o.key, o);
    return m;
  }, [projLayout]);

  return (
    <div
      ref={containerRef}
      className="ftree"
      style={{ height: projLayout.height }}
      data-dragging={drag?.started || undefined}
    >
      {dropBox && (
        <div className="ftree__dropbox" style={{ top: dropBox.top, height: dropBox.height }} />
      )}
      {!dropBox && dropFx && (
        <div
          className="ftree__dropbox ftree__dropbox--confirm"
          style={{ top: dropFx.top, height: dropFx.height }}
        />
      )}

      {renderKeys.map((entry) => {
        const key = entry.key;
        const pos = posByKey.get(key);
        const e = entryByKey.get(key);
        if (!pos || !e) return null;
        const isDragged = drag?.started && key === drag.key;
        const y = isDragged ? Math.max(-6, Math.min(projLayout.height - 30, drag!.pointerY)) : pos.y;
        const padLeft = BASE_PAD + pos.depth * INDENT;

        if (e.kind === "header") {
          const m = projLayout.meta.get(e.catId) ?? { feeds: 0, unread: 0 };
          const isCollapsed = collapsed.has(e.catId);
          return (
            <div
              key={key}
              className="ftree__row ftree__header"
              data-dragged={isDragged || undefined}
              style={{
                top: y,
                height: ROW_H,
                paddingLeft: padLeft,
                opacity: pos.hidden && !isDragged ? 0 : 1,
                pointerEvents: pos.hidden ? "none" : "auto",
                zIndex: isDragged ? 30 : 2,
              }}
              onPointerDown={(ev) => startDrag(ev, e, pos.y)}
              onClick={() => {
                if (didDragRef.current) {
                  didDragRef.current = false;
                  return;
                }
                toggleCollapse(e.catId);
              }}
            >
              <svg
                className="ftree__chev"
                width={9}
                height={9}
                viewBox="0 0 10 10"
                fill="none"
                style={{ transform: isCollapsed ? "rotate(-90deg)" : "none" }}
              >
                <path
                  d="M2 3.5 5 6.5 8 3.5"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="ftree__hname">{catTitle.get(e.catId)}</span>
              <span className="ftree__hcount">
                {m.feeds} {m.feeds === 1 ? "feed" : "feeds"}
              </span>
              {m.unread > 0 && <span className="ftree__unread">{m.unread}</span>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="ftree__more ftree__more--header"
                    aria-label="Folder options"
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl">
                  <DropdownMenuItem onClick={() => onMarkFolderRead(e.catId)}>
                    <CheckCheck className="size-4" />
                    Mark all as read
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDeleteFolder(e.catId, false)}>
                    <FolderMinus className="size-4" />
                    Delete folder · keep feeds
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDeleteFolder(e.catId, true)}
                  >
                    <Trash2 className="size-4" />
                    Delete folder &amp; feeds
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        }

        const feed = feedMeta.get(e.feedId!);
        if (!feed) return null;
        const active = feed.id === activeFeedId;
        return (
          <div
            key={key}
            className="ftree__row ftree__feed"
            data-active={active || undefined}
            data-dragged={isDragged || undefined}
            style={
              {
                top: y,
                height: ROW_H,
                paddingLeft: padLeft,
                opacity: pos.hidden && !isDragged ? 0 : 1,
                pointerEvents: pos.hidden ? "none" : "auto",
                zIndex: isDragged ? 30 : 3,
                "--feed": feedColor(feed.id),
              } as React.CSSProperties
            }
            onPointerDown={(ev) => startDrag(ev, e, pos.y)}
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
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={(ev) => ev.stopPropagation()}
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
