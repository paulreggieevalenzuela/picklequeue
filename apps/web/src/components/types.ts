import type { CommandInput } from "@/lib/store";

/** Dispatch a command; shows errors as a toast and an optional success message. Returns success. */
export type Run = (cmd: CommandInput, success?: string) => boolean;
