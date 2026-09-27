import clsx from "clsx";
import type { SessionPlayer } from "@pickle-queue/core";

function short(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : (first ?? "");
}

function Seat({
  player,
  align,
  onSelect,
}: {
  player: SessionPlayer | undefined;
  align: "left" | "right";
  onSelect?: (p: SessionPlayer) => void;
}) {
  const label = (
    <span
      className={clsx(
        "truncate font-display text-lg leading-tight font-semibold sm:text-xl",
        !player && "text-white/50 italic",
        player?.leaveAfterMatch && "line-through decoration-2",
      )}
    >
      {player ? short(player.name) : "Open seat"}
    </span>
  );
  const cls = clsx("flex min-w-0 items-center px-2", align === "right" && "justify-end text-right");
  if (player && onSelect) {
    return (
      <button type="button" onClick={() => onSelect(player)} className={clsx(cls, "hover:bg-white/10")} title={`${player.name}: options`}>
        {label}
      </button>
    );
  }
  return <div className={cls}>{label}</div>;
}

/**
 * A top-down court: baselines at the ends, kitchen (non-volley zone) either
 * side of the net, a service center line in each back court. Team A plays on
 * the left, Team B on the right. Scores sit in the kitchens.
 */
export function CourtDiagram({
  teamA,
  teamB,
  scoreA,
  scoreB,
  serving,
  dim,
  onSelect,
  children,
}: {
  teamA: (SessionPlayer | undefined)[];
  teamB: (SessionPlayer | undefined)[];
  scoreA?: number | null;
  scoreB?: number | null;
  serving?: "A" | "B" | null;
  dim?: boolean;
  /** Makes player names tappable (organizer: check out, edit). */
  onSelect?: (p: SessionPlayer) => void;
  children?: React.ReactNode;
}) {
  const rows = Math.max(teamA.length, teamB.length);
  const kitchen = "16%"; // 7 ft of a 22 ft half court ≈ 32% of the half
  return (
    <div
      className={clsx(
        "relative aspect-[2.1/1] w-full overflow-hidden rounded-md border-[3px] border-white bg-court text-white",
        dim && "opacity-45 grayscale",
      )}
    >
      {/* Kitchen lines */}
      <div className="absolute inset-y-0 border-l-2 border-white/90" style={{ left: `calc(50% - ${kitchen})` }} />
      <div className="absolute inset-y-0 border-l-2 border-white/90" style={{ left: `calc(50% + ${kitchen})` }} />
      {/* Center service lines (baseline to kitchen line) */}
      <div className="absolute top-1/2 left-0 border-t-2 border-white/90" style={{ width: `calc(50% - ${kitchen})` }} />
      <div className="absolute top-1/2 right-0 border-t-2 border-white/90" style={{ width: `calc(50% - ${kitchen})` }} />
      {/* Net */}
      <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-court-deep" />
      <div className="absolute inset-y-0 left-1/2 border-l-2 border-dashed border-white/80" />

      {/* Players */}
      {rows > 0 && (
        <>
      <div className="absolute inset-y-0 left-0 grid" style={{ width: `calc(50% - ${kitchen})`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {Array.from({ length: rows }, (_, i) => (
          <Seat key={i} player={teamA[i]} align="left" onSelect={onSelect} />
        ))}
      </div>
      <div className="absolute inset-y-0 right-0 grid" style={{ width: `calc(50% - ${kitchen})`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {Array.from({ length: rows }, (_, i) => (
          <Seat key={i} player={teamB[i]} align="right" onSelect={onSelect} />
        ))}
      </div>
        </>
      )}

      {/* Scores in the kitchens */}
      {scoreA != null && scoreB != null && (
        <>
          <Score value={scoreA} serving={serving === "A"} style={{ left: `calc(50% - ${kitchen})`, right: "50%" }} />
          <Score value={scoreB} serving={serving === "B"} style={{ left: "50%", right: `calc(50% - ${kitchen})` }} />
        </>
      )}
      {children}
    </div>
  );
}

function Score({ value, serving, style }: { value: number; serving: boolean; style: React.CSSProperties }) {
  return (
    <div className="absolute inset-y-0 flex flex-col items-center justify-center" style={style}>
      <span className="tabular font-display text-4xl leading-none font-extrabold sm:text-5xl">{value}</span>
      <span className={clsx("mt-1 size-2.5 rounded-full", serving ? "bg-ball" : "bg-transparent")} aria-label={serving ? "Serving" : undefined} />
    </div>
  );
}
