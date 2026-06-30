"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import {
  Sparkles,
  CircleDot,
  Bookmark,
  ChevronRight,
  Plus,
  RefreshCw,
  Sun,
  Moon,
  Newspaper,
  MoreHorizontal,
  CheckCheck,
  Trash2,
} from "lucide-react";
import type { Filter, FeedsTree, FeedNode } from "@/lib/types";
import { Favicon } from "@/components/Img";
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

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
  indent,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      className="nav-item"
      data-active={active}
      onClick={onClick}
      style={indent ? { paddingLeft: 32 } : undefined}
    >
      <span className="nav-item__icon">{icon}</span>
      <span className="nav-item__label">{label}</span>
      {count != null && count > 0 && <span className="nav-item__count">{count}</span>}
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

  const is = (kind: Filter["kind"], id?: number) =>
    filter.kind === kind && filter.id === id;

  const pick = (f: Filter) => {
    onSelect(f);
    onClose();
  };

  const multiCat = (tree?.categories.length ?? 0) > 1;

  return (
    <>
      {open && <div className="sidebar__backdrop" onClick={onClose} />}
      <aside className="sidebar" data-open={open}>
        <div className="sidebar__brand">
          <span className="sidebar__brandmark">
            <Newspaper className="size-4" />
          </span>
          News
        </div>

        <nav className="sidebar__scroll">
          <NavItem
            icon={<Sparkles className="size-[18px]" />}
            label="Today"
            active={is("today")}
            onClick={() => pick({ kind: "today", label: "Today" })}
          />
          <NavItem
            icon={<CircleDot className="size-[18px]" />}
            label="Unread"
            count={tree?.totalUnread}
            active={is("unread")}
            onClick={() => pick({ kind: "unread", label: "Unread" })}
          />
          <NavItem
            icon={<Bookmark className="size-[18px]" />}
            label="Bookmarks"
            count={tree?.starred}
            active={is("starred")}
            onClick={() => pick({ kind: "starred", label: "Bookmarks" })}
          />

          <div className="sidebar__group-label sidebar__group-row">
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

          {tree?.categories.map((cat) => {
            const isCollapsed = collapsed.has(cat.id);
            return (
              <div key={cat.id}>
                <div className="nav-item" data-active={is("category", cat.id)}>
                  <button
                    type="button"
                    className="nav-item__icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(cat.id);
                    }}
                    aria-label={isCollapsed ? "Expand" : "Collapse"}
                    style={{
                      transition: "transform .18s ease",
                      transform: isCollapsed ? "none" : "rotate(90deg)",
                    }}
                  >
                    <ChevronRight className="size-4" />
                  </button>
                  <span
                    className="nav-item__label"
                    style={{ cursor: "pointer", fontWeight: 600 }}
                    onClick={() =>
                      pick({ kind: "category", id: cat.id, label: cat.title })
                    }
                  >
                    {cat.title}
                  </span>
                  {cat.unread > 0 && <span className="nav-item__count">{cat.unread}</span>}
                </div>

                {!isCollapsed &&
                  cat.feeds.map((feed) => (
                    <div
                      key={feed.id}
                      className="nav-item"
                      data-active={is("feed", feed.id)}
                      style={{ paddingLeft: 32 }}
                    >
                      <Favicon feedId={feed.id} className="nav-feedicon" />
                      <span
                        className="nav-item__label"
                        style={{ cursor: "pointer" }}
                        onClick={() => pick({ kind: "feed", id: feed.id, label: feed.title })}
                      >
                        {feed.title}
                      </span>
                      {feed.unread > 0 && <span className="nav-item__count">{feed.unread}</span>}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="nav-item__more"
                            aria-label="Feed options"
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
                  ))}
              </div>
            );
          })}

          {!multiCat &&
            tree?.categories.length === 0 && (
              <div style={{ padding: "12px 10px", fontSize: 13, color: "var(--muted-foreground)" }}>
                No feeds yet.
              </div>
            )}
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
