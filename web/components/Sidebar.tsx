"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  Newspaper,
  CircleDot,
  Bookmark,
  Plus,
  FolderPlus,
  RefreshCw,
  Sun,
  Moon,
} from "lucide-react";
import type { Filter, FeedsTree, FeedNode } from "@/lib/types";
import { FolderTree } from "@/components/FolderTree";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarProps {
  tree?: FeedsTree;
  filter: Filter;
  onSelect: (f: Filter) => void;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onAddFeed: () => void;
  onMarkFeedRead: (feedId: number) => void;
  onRemoveFeed: (feed: FeedNode) => void;
  onMoveFeed: (feedId: number, toCatId: number) => void;
  onCreateFolder: (title: string) => void;
}

function ViewRow({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="viewrow" data-active={active} onClick={onClick}>
      <span className="viewrow__icon">{icon}</span>
      <span className="viewrow__label">{label}</span>
      {count != null && count > 0 && <span className="viewrow__count">{count}</span>}
    </button>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label="Toggle theme"
        >
          {mounted && isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isDark ? "Light mode" : "Dark mode"}</TooltipContent>
    </Tooltip>
  );
}

function NewFolder({ onCreate }: { onCreate: (title: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const commit = () => {
    const t = name.trim();
    if (t) onCreate(t);
    setName("");
    setAdding(false);
  };

  if (!adding) {
    return (
      <button type="button" className="ftree__newfolder" onClick={() => setAdding(true)}>
        <FolderPlus className="size-4" />
        New folder
      </button>
    );
  }
  return (
    <div className="ftree__newfolder ftree__newfolder--editing">
      <FolderPlus className="size-4" />
      <input
        ref={inputRef}
        value={name}
        placeholder="Folder name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setName("");
            setAdding(false);
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}

export function Sidebar({
  tree,
  filter,
  onSelect,
  open,
  onClose,
  onRefresh,
  refreshing,
  onAddFeed,
  onMarkFeedRead,
  onRemoveFeed,
  onMoveFeed,
  onCreateFolder,
}: SidebarProps) {
  const is = (kind: Filter["kind"], id?: number) => filter.kind === kind && filter.id === id;
  const pick = (f: Filter) => {
    onSelect(f);
    onClose();
  };

  return (
    <>
      {open && <div className="sidebar__backdrop" onClick={onClose} />}
      <aside className="sidebar" data-open={open}>
        <div className="sidebar__brand">
          News<span className="sidebar__brand-dot" aria-hidden />
        </div>

        <nav className="sidebar__scroll">
          <div className="railviews">
            <ViewRow
              icon={<Newspaper className="size-[18px]" />}
              label="Today"
              active={is("today")}
              onClick={() => pick({ kind: "today", label: "Today" })}
            />
            <ViewRow
              icon={<CircleDot className="size-[18px]" />}
              label="Unread"
              count={tree?.totalUnread}
              active={is("unread")}
              onClick={() => pick({ kind: "unread", label: "Unread" })}
            />
            <ViewRow
              icon={<Bookmark className="size-[18px]" />}
              label="Saved"
              count={tree?.starred}
              active={is("starred")}
              onClick={() => pick({ kind: "starred", label: "Saved" })}
            />
          </div>

          <div className="rail-section-head">
            <span>Channels</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="sidebar__add"
                  onClick={onAddFeed}
                  aria-label="Add feed"
                >
                  <Plus className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Add feed</TooltipContent>
            </Tooltip>
          </div>

          {tree && (
            <FolderTree
              categories={tree.categories}
              filter={filter}
              onSelectFeed={(feed) => pick({ kind: "feed", id: feed.id, label: feed.title })}
              onMarkFeedRead={onMarkFeedRead}
              onRemoveFeed={onRemoveFeed}
              onMoveFeed={onMoveFeed}
            />
          )}

          <NewFolder onCreate={onCreateFolder} />
        </nav>

        <div className="sidebar__footer">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full gap-2 px-3"
                onClick={onRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`size-4 ${refreshing ? "spin" : ""}`} />
                <span className="text-[13px]">Refresh</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fetch new stories</TooltipContent>
          </Tooltip>
          <div className="topbar__spacer" />
          <ThemeToggle />
        </div>
      </aside>
    </>
  );
}
