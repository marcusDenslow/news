"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { AnimatePresence } from "motion/react";
import { toast } from "sonner";
import type { CardEntry, Filter, FeedsTree } from "@/lib/types";
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
    (entry: CardEntry) => {
      setSelected(entry);
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
      />

      <main className="main">
        <TopBar
          title={filter.label}
          onMenu={() => setSidebarOpen(true)}
          search={search}
          onSearch={setSearch}
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

      <AnimatePresence>
        {selected && (
          <Reader
            key={selected.id}
            entry={selected}
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
