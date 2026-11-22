"use client";

import { IconMegaphone } from "./Icons";
import type { Announcement } from "@/lib/types";

export function Banner({ items, onDismiss }: { items: Announcement[]; onDismiss: () => void }) {
  if (items.length === 0) return null;
  return (
    <>
      {items.map((a) => (
        <div className="banner" key={a.id} role="status">
          <span style={{ color: "#b05a00", flex: "none", marginTop: 2 }} aria-hidden="true">
            <IconMegaphone size={19} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t">{a.title}</div>
            <div className="b">{a.body}</div>
          </div>
          <button type="button" className="x" onClick={onDismiss} aria-label="知道了，关闭公告">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
    </>
  );
}