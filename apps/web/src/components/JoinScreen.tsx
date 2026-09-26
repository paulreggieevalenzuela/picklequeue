"use client";

import { makeId } from "@pickle-queue/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import * as cloud from "@/lib/cloud";
import { useSession } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { SKILLS } from "./PlayerDialog";
import { SessionGate } from "./SessionGate";
import { Button, Field, Input, Select } from "./ui";
import { useRun } from "./useRun";

const SKILL_HINTS: Record<string, string> = {
  "2": "New to the game",
  "2.5": "Learning the basics",
  "3": "Consistent rallies",
  "3.5": "Dinks and third shots",
  "4": "Solid all-round",
  "4.5": "Advanced",
  "5": "Tournament level",
};

/**
 * Self check-in. Players scan the QR code (cloud mode) or use this screen on a
 * tablet at the desk (works on one device without cloud sync).
 */
export function JoinScreen({ sessionId }: { sessionId: string }) {
  const session = useSession(sessionId);
  const run = useRun(session);
  const router = useRouter();
  const setMe = useStore((s) => s.setMe);
  const [name, setName] = useState("");
  const [skill, setSkill] = useState("3");
  const [origin, setOrigin] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- origin is only known in the browser
  useEffect(() => setOrigin(window.location.origin), []);
  const { state, isOrganizer } = session;

  function checkIn(e: React.FormEvent) {
    e.preventDefault();
    const id = makeId("p_");
    if (!run({ type: "AddPlayer", player: { id, name: name.trim(), skill: Number(skill) } }, `Welcome, ${name.trim()}!`)) return;
    if (isOrganizer && !cloud.enabled) {
      // Shared kiosk: reset for the next person.
      setName("");
      return;
    }
    setMe(sessionId, id);
    router.push(`/s/${sessionId}/me/${id}`);
  }

  return (
    <SessionGate status={session.status}>
      {state && (
        <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6">
          <header className="flex items-center justify-between">
            <Link href={isOrganizer ? `/s/${sessionId}` : "/"} className="font-semibold text-muted hover:text-ink">
              {isOrganizer ? "Back to board" : "Pickle Queue"}
            </Link>
          </header>
          <div className="grid items-start gap-10 md:grid-cols-[1fr_auto]">
            <form onSubmit={checkIn} className="flex flex-col gap-5">
              <h1 className="font-display text-5xl leading-none font-extrabold">Check in to {state.name}</h1>
              <Field label="Your name">
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={40} required className="text-lg" />
              </Field>
              <Field label="Skill level" hint={SKILL_HINTS[String(Number(skill))]}>
                <Select value={skill} onChange={(e) => setSkill(e.target.value)} className="text-lg">
                  {SKILLS.map((s) => (
                    <option key={s} value={s}>
                      {s.toFixed(1)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button variant="primary" size="lg" type="submit" disabled={!name.trim()}>
                Check in
              </Button>
              <p className="text-sm text-muted">No account needed. You can rest or step away any time without losing your place.</p>
            </form>
            {origin && (
              <aside className="flex flex-col items-center gap-3 rounded-2xl bg-white p-5 text-court-deep ring-1 ring-line">
                <QRCodeSVG value={`${origin}/s/${sessionId}/join`} size={200} marginSize={0} />
                <p className="tabular font-display text-4xl font-extrabold tracking-widest">{state.joinCode}</p>
                <p className="max-w-52 text-center text-sm">
                  {cloud.enabled ? "Scan with your phone to check in and follow the line." : "Phone check-in needs cloud sync. Use this screen at the desk for now."}
                </p>
              </aside>
            )}
          </div>
        </main>
      )}
    </SessionGate>
  );
}
