"use client";

import { getPlayerStatus } from "@pickle-queue/core";
import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/hooks";
import { enableNotifications, notificationsSupported, notify } from "@/lib/notify";
import { SessionGate } from "./SessionGate";
import { Button, Field, Select, minutes } from "./ui";
import { useRun } from "./useRun";

export function MyStatus({ sessionId, playerId }: { sessionId: string; playerId: string }) {
  const session = useSession(sessionId, 10_000);
  const run = useRun(session);
  const { state, now } = session;
  const view = state ? getPlayerStatus(state, playerId, now) : null;
  const [notifyOn, setNotifyOn] = useState(false);
  const lastCalled = useRef<string | null>(null);

  const calledTo = view?.liveMatch?.status === "called" ? view.courtName : null;
  useEffect(() => {
    const key = view?.liveMatch?.status === "called" ? view.liveMatch.id : null;
    if (key && key !== lastCalled.current && calledTo) {
      void notify(`You're up on ${calledTo}`, `${state?.name ?? "Open play"}: head to ${calledTo}.`, `/s/${sessionId}/me/${playerId}`);
    }
    lastCalled.current = key;
  }, [view?.liveMatch, calledTo, state?.name, sessionId, playerId]);

  if (session.status === "ready" && !view) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <p className="text-muted">We couldn&apos;t find you in this session.</p>
        <Link href={`/s/${sessionId}/join`} className="font-semibold text-court underline">
          Check in
        </Link>
      </main>
    );
  }

  const p = view?.player;
  const partnerName = (ids: string[]) => ids.filter((id) => id !== playerId).map((id) => state?.players[id]?.name).join(" & ");

  return (
    <SessionGate status={session.status}>
      {state && view && p && (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-6">
          <header>
            <p className="text-muted">{state.name}</p>
            <h1 className="font-display text-4xl font-extrabold">{p.name}</h1>
          </header>

          <section
            aria-live="polite"
            className={clsx(
              "rounded-2xl p-6",
              calledTo ? "called-pulse bg-ball text-ball-ink" : "bg-court text-white",
            )}
          >
            {calledTo ? (
              <>
                <p className="font-display text-5xl leading-none font-extrabold">You&apos;re up on {calledTo}</p>
                <p className="mt-2 text-lg">
                  With {partnerName(view.liveMatch!.teamA.includes(playerId) ? view.liveMatch!.teamA : view.liveMatch!.teamB) || "your opponent"}
                </p>
              </>
            ) : view.liveMatch ? (
              <p className="font-display text-4xl font-extrabold">Playing on {view.courtName}</p>
            ) : p.status === "resting" || p.status === "away" ? (
              <>
                <p className="font-display text-4xl font-extrabold">{p.status === "resting" ? "Resting" : "Away"}</p>
                <p className="mt-1 text-white/80">You keep your place in line while you&apos;re out.</p>
              </>
            ) : p.status === "left" ? (
              <p className="font-display text-4xl font-extrabold">Checked out</p>
            ) : view.entry ? (
              <>
                <p className="tabular font-display text-7xl leading-none font-extrabold">#{view.entry.position}</p>
                <p className="mt-2 text-lg">
                  in line, {view.entry.etaMin <= 0 ? "on very soon" : `on in ${minutes(view.entry.etaMin)}`}
                </p>
              </>
            ) : null}
          </section>

          <div className="flex flex-wrap gap-2">
            {p.status === "waiting" && (
              <>
                <Button onClick={() => run({ type: "SetRest", playerId }, "Enjoy the break. Your place is saved.")}>Take a break</Button>
                <Button onClick={() => run({ type: "SetAway", playerId }, "Marked away. Your place is saved.")}>Step away</Button>
              </>
            )}
            {(p.status === "resting" || p.status === "away" || p.status === "left") && (
              <Button variant="primary" onClick={() => run({ type: "ReturnPlayer", playerId }, "You're back in line")}>
                I&apos;m back
              </Button>
            )}
            {notificationsSupported() && !notifyOn && (
              <Button variant="court" onClick={async () => setNotifyOn(await enableNotifications())}>
                Notify me when I&apos;m up
              </Button>
            )}
          </div>

          <Field label="Play with" hint="The queue tries to put you on the same team.">
            <Select
              value={p.partnerRequestId ?? ""}
              onChange={(e) => run({ type: "SetPartnerRequest", playerId, partnerId: e.target.value || null }, "Partner request saved")}
            >
              <option value="">No preference</option>
              {Object.values(state.players)
                .filter((o) => o.id !== playerId && o.status !== "left")
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </Select>
          </Field>

          <section className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Games", value: p.gamesPlayed },
              { label: "Won", value: p.wins },
              { label: "Points +/−", value: p.pointsFor - p.pointsAgainst },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-surface p-3 ring-1 ring-line">
                <p className="tabular font-display text-3xl font-bold">{s.value}</p>
                <p className="text-sm text-muted">{s.label}</p>
              </div>
            ))}
          </section>
        </main>
      )}
    </SessionGate>
  );
}
