"use client";

import { useNow } from "@/lib/hooks";

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

export function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** A running mm:ss timer. Ticks on its own so the rest of the page doesn't re-render every second. */
export function Elapsed({ since, className }: { since: number; className?: string }) {
  const now = useNow(1_000);
  return (
    <time className={`tabular ${className ?? ""}`} dateTime={new Date(since).toISOString()} aria-label={`${Math.floor((now - since) / 60000)} minutes`}>
      {formatElapsed(now - since)}
    </time>
  );
}
