"use client";

import clsx from "clsx";
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

type Variant = "primary" | "court" | "quiet" | "danger" | "outline";

const variants: Record<Variant, string> = {
  primary: "bg-ball text-ball-ink hover:brightness-95",
  court: "bg-court text-white hover:bg-court-deep",
  quiet: "bg-transparent text-ink hover:bg-line/60",
  outline: "border border-line bg-surface text-ink hover:border-muted",
  danger: "bg-transparent text-danger hover:bg-danger/10",
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" && "min-h-9 px-2.5 text-sm",
        size === "md" && "min-h-11 px-4",
        size === "lg" && "min-h-14 px-6 text-lg",
        variants[variant],
        className,
      )}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx("min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-ink placeholder:text-muted", className)}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={clsx("min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-ink", className)} />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </label>
  );
}

/** Native <dialog> as a bottom sheet on phones, centered on larger screens. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto w-full max-w-none rounded-t-2xl bg-surface p-0 text-ink backdrop:bg-ink/50 sm:m-auto sm:max-w-lg sm:rounded-2xl"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-display text-2xl font-bold">{title}</h2>
        <Button variant="quiet" size="sm" onClick={onClose} aria-label="Close">
          Close
        </Button>
      </div>
      <div className="max-h-[75dvh] overflow-y-auto px-5 py-4">{open && children}</div>
    </dialog>
  );
}

export function SkillBadge({ skill }: { skill: number }) {
  return <span className="tabular rounded bg-line/70 px-1.5 py-0.5 text-xs font-semibold text-muted">{skill.toFixed(1)}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

export function minutes(n: number): string {
  if (n <= 0) return "now";
  if (n < 60) return `~${n} min`;
  return `~${Math.floor(n / 60)} h ${n % 60} min`;
}
