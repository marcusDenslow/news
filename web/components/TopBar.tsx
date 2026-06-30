"use client";

import { useEffect, useState } from "react";
import { Menu, Search, X, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TopBarProps {
  title: string;
  onMenu: () => void;
  search: string;
  onSearch: (q: string) => void;
  showMarkAll: boolean;
  onMarkAllRead: () => void;
}

export function TopBar({
  title,
  onMenu,
  search,
  onSearch,
  showMarkAll,
  onMarkAllRead,
}: TopBarProps) {
  const [value, setValue] = useState(search);

  // Keep local input in sync if the committed search is cleared elsewhere.
  useEffect(() => setValue(search), [search]);

  // Debounce commits to the parent.
  useEffect(() => {
    const t = setTimeout(() => {
      if (value !== search) onSearch(value);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <header className="topbar">
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full topbar__menu"
        onClick={onMenu}
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </Button>

      <span className="topbar__section">{title}</span>

      <div className="topbar__spacer" />

      {showMarkAll && (
        <button type="button" className="markall-btn" onClick={onMarkAllRead}>
          <CheckCheck className="size-4" />
          <span>Mark all read</span>
        </button>
      )}

      <div className="topbar__search">
        <Search className="topbar__search-icon size-4" />
        <input
          className="topbar__search-input"
          placeholder="Search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
        />
        {value && (
          <button
            type="button"
            className="topbar__search-clear"
            aria-label="Clear search"
            onClick={() => {
              setValue("");
              onSearch("");
            }}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </header>
  );
}
