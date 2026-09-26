"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { SessionStatus } from "@/lib/hooks";

/** Loading / not-found states shared by every session screen. */
export function SessionGate({ status, children }: { status: SessionStatus; children: ReactNode }) {
  if (status === "loading") {
    return <p className="p-8 text-center text-muted">Loading session…</p>;
  }
  if (status === "missing") {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-8 text-center">
        <h1 className="font-display text-3xl font-bold">Session not found</h1>
        <p className="text-muted">
          This session isn&apos;t saved on this device. Open it on the device that created it, or connect cloud sync so every device can see it.
        </p>
        <Link href="/" className="font-semibold text-court underline">
          Go to your sessions
        </Link>
      </main>
    );
  }
  return <>{children}</>;
}
