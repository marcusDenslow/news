"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { runThemeTransition } from "@/lib/themeTransition";
import {
  CircleDot,
  Bookmark,
  Plus,
  FolderPlus,
  RefreshCw,
  Sun,
  Moon,
  LogOut,
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
  onMarkFolderRead: (catId: number) => void;
  onDeleteFolder: (catId: number, withFeeds: boolean) => void;
  username?: string;
  onLogout: () => void;
}

// Today's list-lines mark, straight from the "News Reader" design (3a).
function TodayIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 15 15" fill="none" aria-hidden>
      <path
        d="M2 3.5h11M2 7.5h11M2 11.5h7"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
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

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next = isDark ? "light" : "dark";
    const rect = e.currentTarget.getBoundingClientRect();
    // Sweep originates at the icon's exact center.
    runThemeTransition(
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      () => {
        // Flip the class inside the view-transition callback so the "new"
        // snapshot already carries the target theme; setTheme then persists it
        // and keeps next-themes in sync.
        document.documentElement.classList.toggle("dark", next === "dark");
        setTheme(next);
      }
    );
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="theme-toggle-btn rounded-full"
          onClick={toggle}
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
  onMarkFolderRead,
  onDeleteFolder,
  username,
  onLogout,
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
              icon={<TodayIcon />}
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
              onMarkFolderRead={onMarkFolderRead}
              onDeleteFolder={onDeleteFolder}
            />
          )}
        </nav>

        {/* Pinned below the scroll — New folder always sits at the bottom of the list. */}
        <div className="sidebar__newfolder-dock">
          <NewFolder onCreate={onCreateFolder} />
        </div>

        {username && (
          <div className="sidebar__account">
            <span className="sidebar__account-avatar" aria-hidden>
              {username.slice(0, 1).toUpperCase()}
            </span>
            <span className="sidebar__account-name">{username}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="sidebar__logout"
                  onClick={onLogout}
                  aria-label="Sign out"
                >
                  <LogOut className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Sign out</TooltipContent>
            </Tooltip>
          </div>
        )}

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
