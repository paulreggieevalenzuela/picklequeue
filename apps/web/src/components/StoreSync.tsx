"use client";

import { useOffline } from "next/offline";
import { useStoreSync } from "@/lib/hooks";
import { useToasts } from "@/lib/toast";
import { enabled as cloudEnabled } from "@/lib/cloud";

/** App-wide client plumbing: storage hydration, tab sync, toasts and the offline banner. */
export function StoreSync() {
  useStoreSync();
  const offline = useOffline();
  const { toasts, dismiss } = useToasts();
  return (
    <>
      {offline && (
        <div role="status" className="sticky top-0 z-50 bg-ball px-4 py-2 text-center text-sm font-semibold text-ball-ink">
          {cloudEnabled
            ? "You're offline. Changes are saved on this device and will sync when you reconnect."
            : "You're offline. Everything keeps working on this device."}
        </div>
      )}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto max-w-md rounded-lg px-4 py-3 text-left text-sm font-medium shadow-lg ${
              t.tone === "error" ? "bg-danger text-white" : "bg-ink text-paper"
            }`}
          >
            {t.text}
          </button>
        ))}
      </div>
    </>
  );
}
