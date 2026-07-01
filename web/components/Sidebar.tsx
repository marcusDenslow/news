"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import {
  Newspaper,
  CircleDot,
  Bookmark,
  ChevronRight,
  Plus,
  RefreshCw,
  Sun,
  Moon,
  MoreHorizontal,
  CheckCheck,
  Trash2,
} from "lucide-react";
import type { Filter, FeedsTree, FeedNode } from "@/lib/types";
import { Favicon } from "@/components/Img";
import { feedColor } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const is = (kind: Filter["kind"], id?: number) => filter.kind === kind && filter.id === id;
  const pick = (f: Filter) => {
    onSelect(f);
    onClose();
  };

  const cats = tree?.categories ?? [];
  const single = cats.length === 1;

  const FeedRow = (feed: FeedNode) => (
    <div
      key={feed.id}
      className="feedrow"
      data-active={is("feed", feed.id)}
      style={{ "--feed": feedColor(feed.id) } as React.CSSProperties}
    >
      <button
        type="button"
        className="feedrow__main"
        onClick={() => pick({ kind: "feed", id: feed.id, label: feed.title })}
      >
        <span className="feedrow__avatar">
          <Favicon feedId={feed.id} className="feedrow__favicon" />
        </span>
        <span className="feedrow__name">{feed.title}</span>
      </button>
      {feed.unread > 0 && <span className="feedrow__dot" aria-label={`${feed.unread} unread`} />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="feedrow__more" aria-label="Feed options">
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

          {cats.map((cat) => {
            const isCollapsed = collapsed.has(cat.id);
            return (
              <div key={cat.id}>
                {!single && (
                  <div className="catrow" data-active={is("category", cat.id)}>
                    <button
                      type="button"
                      className="catrow__chevron"
                      onClick={() => toggle(cat.id)}
                      aria-label={isCollapsed ? "Expand" : "Collapse"}
                      style={{ transform: isCollapsed ? "none" : "rotate(90deg)" }}
                    >
                      <ChevronRight className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="catrow__name"
                      onClick={() => pick({ kind: "category", id: cat.id, label: cat.title })}
                    >
                      {cat.title}
                    </button>
                    {cat.unread > 0 && <span className="catrow__count">{cat.unread}</span>}
                  </div>
                )}
                {(single || !isCollapsed) && (
                  <div className="feedlist">{cat.feeds.map((feed) => FeedRow(feed))}</div>
                )}
              </div>
            );
          })}
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
