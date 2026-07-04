"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { AnimatePresence } from "motion/react";
import { toast } from "sonner";
import type { CardEntry, Filter, FeedsTree, FeedNode } from "@/lib/types";
import { jsonFetcher } from "@/lib/format";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Stream } from "@/components/Stream";
import { Reader } from "@/components/Reader";
import { AddFeedDialog } from "@/components/AddFeedDialog";

const PAGE = 24;
type Page = { total: number; entries: CardEntry[] };

export function App() {
  const [filter, setFilter] = useState<Filter>({ kind: "today", label: "Today" });
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<CardEntry | null>(null);
  // On-screen rect of the clicked card image, captured at click time. The reader
  // flies a single image element from here into its hero (and back on close).
  // Cleared once the close animation finishes (AnimatePresence onExitComplete).
  const [origin, setOrigin] = useState<DOMRect | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const { data: tree, mutate: mutateTree } = useSWR<FeedsTree>(
    "/api/feeds",
    jsonFetcher,
    { revalidateOnFocus: false }
  );

  const buildQuery = useCallback(
    (offset: number) => {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (filter.kind === "unread") p.set("status", "unread");
      if (filter.kind === "starred") p.set("starred", "true");
      if (filter.kind === "category" && filter.id) p.set("category", String(filter.id));
      if (filter.kind === "feed" && filter.id) p.set("feed", String(filter.id));
      if (search.trim()) p.set("search", search.trim());
      return `/api/entries?${p.toString()}`;
    },
    [filter, search]
  );

  const getKey = useCallback(
    (index: number, prev: Page | null) => {
      if (prev && prev.entries.length === 0) return null; // end reached
      return buildQuery(index * PAGE);
    },
    [buildQuery]
  );

  const { data, error, size, setSize, isValidating, mutate } = useSWRInfinite<Page>(
    getKey,
    jsonFetcher,
    { revalidateFirstPage: false, revalidateOnFocus: false }
  );

  // De-duplicate across pages (new items can shift offsets).
  const entries = useMemo(() => {
    const seen = new Set<number>();
    const out: CardEntry[] = [];
    for (const page of data ?? []) {
      for (const e of page.entries) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          out.push(e);
        }
      }
    }
    return out;
  }, [data]);

  const total = data?.[0]?.total ?? 0;
  const isLoadingInitial = !data && !error;
  const isLoadingMore =
    isLoadingInitial || (size > 0 && !!data && typeof data[size - 1] === "undefined");
  const isEmpty = data?.[0]?.entries.length === 0;
  const isReachingEnd =
    isEmpty || (!!data && (data[data.length - 1]?.entries.length ?? 0) < PAGE);

  // Reset paging + scroll when the query changes.
  useEffect(() => {
    setSize(1);
    window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search]);

  // Infinite scroll.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting && !isReachingEnd && !isLoadingMore && !isValidating) {
          setSize((s) => s + 1);
        }
      },
      { rootMargin: "800px 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [isReachingEnd, isLoadingMore, isValidating, setSize]);

  /* ---- mutations ---- */

  const patchEntry = useCallback(
    (id: number, patch: Partial<CardEntry>) => {
      mutate(
        (pages) =>
          pages?.map((pg) => ({
            ...pg,
            entries: pg.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
          })),
        { revalidate: false }
      );
      setSelected((s) => (s && s.id === id ? { ...s, ...patch } : s));
    },
    [mutate]
  );

  const markRead = useCallback(
    async (entry: CardEntry) => {
      if (entry.status === "read") return;
      patchEntry(entry.id, { status: "read" });
      mutateTree(
        (t) => (t ? { ...t, totalUnread: Math.max(0, t.totalUnread - 1) } : t),
        { revalidate: false }
      );
      try {
        await fetch(`/api/entries/${entry.id}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "read" }),
        });
      } catch {
        mutate();
      }
    },
    [patchEntry, mutate, mutateTree]
  );

  const toggleStar = useCallback(
    async (entry: CardEntry) => {
      const starred = !entry.starred;
      patchEntry(entry.id, { starred });
      mutateTree(
        (t) => (t ? { ...t, starred: Math.max(0, t.starred + (starred ? 1 : -1)) } : t),
        { revalidate: false }
      );
      try {
        await fetch(`/api/entries/${entry.id}/star`, { method: "PUT" });
        if (starred) toast.success("Bookmarked");
      } catch {
        mutate();
      }
      if (filter.kind === "starred" && !starred) mutate();
    },
    [patchEntry, mutate, mutateTree, filter.kind]
  );

  /* ---- reader open/close with history ---- */

  const openEntry = useCallback(
    (entry: CardEntry, originRect?: DOMRect) => {
      setSelected(entry);
      setOrigin(originRect);
      window.history.pushState({ reader: entry.id }, "", `#a${entry.id}`);
      markRead(entry);
    },
    [markRead]
  );

  const closeReader = useCallback(() => {
    if (window.history.state?.reader) window.history.back();
    else setSelected(null);
  }, []);

  useEffect(() => {
    const onPop = () => setSelected(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Lock background scroll while an article is open. Owned here (not in Reader)
  // so it releases the instant `selected` clears — i.e. when the close starts,
  // while the opaque sheet still covers the screen — instead of on Reader's
  // unmount after the slide. `overflow: hidden` on <body> demotes the sticky
  // sidebar + top bar to their static offset, so holding it through the exit
  // animation is exactly what made them slide away with the scroll on close.
  useEffect(() => {
    if (!selected) return;
    document.body.classList.add("scroll-lock");
    return () => document.body.classList.remove("scroll-lock");
  }, [selected]);

  const markRangeRead = useCallback(
    (body: { feedId?: number; categoryId?: number }, predicate: (e: CardEntry) => boolean) => {
      mutate(
        (pages) =>
          pages?.map((pg) => ({
            ...pg,
            entries: pg.entries.map((e) =>
              predicate(e) ? { ...e, status: "read" as const } : e
            ),
          })),
        { revalidate: false }
      );
      return fetch("/api/entries/mark-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    [mutate]
  );

  const markAllRead = useCallback(async () => {
    const body: { feedId?: number; categoryId?: number } = {};
    if (filter.kind === "feed" && filter.id) body.feedId = filter.id;
    else if (filter.kind === "category" && filter.id) body.categoryId = filter.id;
    try {
      await markRangeRead(body, () => true);
      toast.success("Marked all as read");
    } catch {
      toast.error("Couldn’t mark all read");
    }
    mutateTree();
    if (filter.kind === "unread") mutate();
  }, [filter, markRangeRead, mutate, mutateTree]);

  const markFeedRead = useCallback(
    async (feedId: number) => {
      try {
        await markRangeRead({ feedId }, (e) => e.feedId === feedId);
        toast.success("Marked all as read");
      } catch {
        toast.error("Couldn’t mark all read");
      }
      mutateTree();
    },
    [markRangeRead, mutateTree]
  );

  const removeFeed = useCallback(
    (feed: FeedNode) => {
      toast(`Remove ${feed.title}?`, {
        description: "You’ll stop receiving its stories.",
        action: {
          label: "Remove",
          onClick: async () => {
            try {
              await fetch(`/api/feeds/${feed.id}`, { method: "DELETE" });
              toast.success("Feed removed");
              if (filter.kind === "feed" && filter.id === feed.id) {
                setFilter({ kind: "today", label: "Today" });
              }
              mutateTree();
              mutate();
            } catch {
              toast.error("Couldn’t remove feed");
            }
          },
        },
      });
    },
    [filter, mutate, mutateTree]
  );

  const moveFeedToCategory = useCallback(
    (feedId: number, toCatId: number) => {
      // Optimistically relocate the feed node (and its unread) between folders
      // so the sidebar settles instantly; the PATCH persists it to Miniflux.
      mutateTree((t) => {
        if (!t) return t;
        let moved: FeedNode | undefined;
        const stripped = t.categories.map((c) => {
          const f = c.feeds.find((x) => x.id === feedId);
          if (f) {
            moved = f;
            return { ...c, feeds: c.feeds.filter((x) => x.id !== feedId), unread: c.unread - f.unread };
          }
          return c;
        });
        if (!moved) return t;
        const next = stripped.map((c) =>
          c.id === toCatId ? { ...c, feeds: [...c.feeds, moved!], unread: c.unread + moved!.unread } : c
        );
        return { ...t, categories: next };
      }, { revalidate: false });

      fetch(`/api/feeds/${feedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: toCatId }),
      })
        .then((r) => {
          if (!r.ok) throw new Error();
          mutateTree();
        })
        .catch(() => {
          toast.error("Couldn’t move feed");
          mutateTree();
        });
    },
    [mutateTree]
  );

  const createFolder = useCallback(
    async (title: string) => {
      try {
        const res = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) throw new Error();
        toast.success(`Folder “${title}” created`);
        mutateTree();
      } catch {
        toast.error("Couldn’t create folder");
      }
    },
    [mutateTree]
  );

  const markFolderRead = useCallback(
    async (catId: number) => {
      const cat = tree?.categories.find((c) => c.id === catId);
      const feedIds = new Set(cat?.feeds.map((f) => f.id) ?? []);
      try {
        await markRangeRead({ categoryId: catId }, (e) => feedIds.has(e.feedId));
        toast.success("Marked all as read");
      } catch {
        toast.error("Couldn’t mark all read");
      }
      mutateTree();
    },
    [tree, markRangeRead, mutateTree]
  );

  // Delete a folder. `withFeeds` removes the feeds too; otherwise the feeds are
  // moved into another folder so nothing is orphaned (Miniflux won't delete a
  // non-empty category). Any browser-local nesting under it self-heals on the
  // next tree build (children pop back to the root).
  const deleteFolder = useCallback(
    (catId: number, withFeeds: boolean) => {
      const cat = tree?.categories.find((c) => c.id === catId);
      if (!cat) return;
      const feeds = cat.feeds;
      const others = tree?.categories.filter((c) => c.id !== catId) ?? [];
      if (!withFeeds && feeds.length > 0 && others.length === 0) {
        toast.error("Create another folder first — its feeds need a home");
        return;
      }
      const target = others[0];
      toast(withFeeds ? `Delete “${cat.title}” and its feeds?` : `Delete folder “${cat.title}”?`, {
        description: withFeeds
          ? `${feeds.length} feed${feeds.length === 1 ? "" : "s"} and their stories will be removed.`
          : feeds.length > 0
            ? `Its ${feeds.length} feed${feeds.length === 1 ? "" : "s"} move to “${target.title}”.`
            : "The empty folder will be removed.",
        action: {
          label: "Delete",
          onClick: async () => {
            try {
              if (withFeeds) {
                await Promise.all(
                  feeds.map((f) => fetch(`/api/feeds/${f.id}`, { method: "DELETE" }))
                );
              } else if (feeds.length > 0) {
                await Promise.all(
                  feeds.map((f) =>
                    fetch(`/api/feeds/${f.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ categoryId: target.id }),
                    })
                  )
                );
              }
              const res = await fetch(`/api/categories/${catId}`, { method: "DELETE" });
              if (!res.ok) throw new Error();
              toast.success(withFeeds ? "Folder and feeds deleted" : "Folder deleted");
              // If the current view lived inside this folder, fall back to Today.
              const viewingDeletedFeed =
                filter.kind === "feed" && withFeeds && feeds.some((f) => f.id === filter.id);
              if ((filter.kind === "category" && filter.id === catId) || viewingDeletedFeed) {
                setFilter({ kind: "today", label: "Today" });
              }
              mutateTree();
              mutate();
            } catch {
              toast.error("Couldn’t delete folder");
              mutateTree();
            }
          },
        },
      });
    },
    [tree, filter, mutateTree, mutate]
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      toast.success("Refreshing feeds…");
      setTimeout(() => {
        mutate();
        mutateTree();
        setRefreshing(false);
      }, 2000);
    } catch {
      toast.error("Refresh failed");
      setRefreshing(false);
    }
  }, [mutate, mutateTree]);

  return (
    <div className="app">
      <Sidebar
        tree={tree}
        filter={filter}
        onSelect={setFilter}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onRefresh={refresh}
        refreshing={refreshing}
        onAddFeed={() => setAddOpen(true)}
        onMarkFeedRead={markFeedRead}
        onRemoveFeed={removeFeed}
        onMoveFeed={moveFeedToCategory}
        onCreateFolder={createFolder}
        onMarkFolderRead={markFolderRead}
        onDeleteFolder={deleteFolder}
      />

      <main className="main" data-reader-open={!!selected}>
        <TopBar
          title={filter.label}
          onMenu={() => setSidebarOpen(true)}
          search={search}
          onSearch={setSearch}
          showMarkAll={!search && filter.kind !== "starred"}
          onMarkAllRead={markAllRead}
        />
        <Stream
          entries={entries}
          filter={filter}
          search={search}
          total={total}
          isLoadingInitial={isLoadingInitial}
          isLoadingMore={isLoadingMore}
          isReachingEnd={isReachingEnd}
          isEmpty={!!isEmpty}
          error={error}
          onOpen={openEntry}
          onToggleStar={toggleStar}
          sentinelRef={sentinelRef}
        />
      </main>

      <AnimatePresence onExitComplete={() => setOrigin(undefined)}>
        {selected && (
          <Reader
            key={selected.id}
            entry={selected}
            origin={origin}
            onClose={closeReader}
            onToggleStar={toggleStar}
          />
        )}
      </AnimatePresence>

      <AddFeedDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => {
          mutateTree();
          mutate();
        }}
      />
    </div>
  );
}
