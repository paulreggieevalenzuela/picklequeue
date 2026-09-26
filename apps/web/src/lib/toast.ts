"use client";

import { create } from "zustand";

type Tone = "info" | "error";
interface Toast {
  id: number;
  text: string;
  tone: Tone;
}

export const useToasts = create<{ toasts: Toast[]; push: (text: string, tone?: Tone) => void; dismiss: (id: number) => void }>(
  (set) => ({
    toasts: [],
    push(text, tone = "info") {
      const id = Date.now() + Math.random();
      set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone }] }));
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === "error" ? 6000 : 3000);
    },
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  }),
);

export const toast = (text: string) => useToasts.getState().push(text, "info");
export const toastError = (text: string) => useToasts.getState().push(text, "error");
