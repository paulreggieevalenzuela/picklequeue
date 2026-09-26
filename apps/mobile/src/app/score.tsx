import { SCORING_PRESETS, callout, replayScore, type ScoreEvent, type Team } from "@pickle-queue/core";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/lib/theme";
import { Body, PrimaryButton } from "@/lib/ui";

const PRESETS = Object.keys(SCORING_PRESETS);

/** Same scoring engine as the web app, running entirely on the device. */
export default function Score() {
  const t = useTheme();
  const [preset, setPreset] = useState(PRESETS[0]!);
  const [doubles, setDoubles] = useState(true);
  const [events, setEvents] = useState<ScoreEvent[]>([]);
  const rules = SCORING_PRESETS[preset]!;
  const s = useMemo(() => replayScore(rules, events, doubles), [rules, events, doubles]);

  const push = (e: ScoreEvent) => setEvents((prev) => [...prev, e]);
  const started = events.length > 0;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {!started && (
        <View style={styles.chips}>
          {PRESETS.map((p) => (
            <Chip key={p} label={p} active={p === preset} onPress={() => setPreset(p)} />
          ))}
          <Chip label={doubles ? "Doubles" : "Singles"} active onPress={() => setDoubles((d) => !d)} />
        </View>
      )}

      <Text style={[styles.callout, { color: t.ink }]} accessibilityLiveRegion="polite">
        {s.finished ? `${s.a}–${s.b}` : callout(s)}
      </Text>
      {s.sideSwitchDue && !s.finished && (
        <Text style={[styles.banner, { backgroundColor: t.ball, color: t.ballInk }]}>Switch sides</Text>
      )}
      {!s.finished && (s.matchPoint || s.gamePoint) && (
        <Text style={[styles.point, { color: t.surround }]}>{s.matchPoint ? "Match point" : "Game point"}</Text>
      )}
      {s.finished && <Text style={[styles.point, { color: t.surround }]}>Team {s.winner} wins</Text>}

      <View style={styles.teams}>
        {(["A", "B"] as Team[]).map((team) => {
          const serving = s.servingTeam === team && !s.finished;
          return (
            <Pressable
              key={team}
              accessibilityRole="button"
              accessibilityLabel={`Rally won by team ${team}`}
              disabled={s.finished}
              onPress={() => push({ type: "RALLY", winner: team, at: Date.now() })}
              style={({ pressed }) => [
                styles.team,
                { backgroundColor: t.court, borderColor: serving ? t.ball : "transparent", opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Text style={styles.teamName}>Team {team}</Text>
              <Text style={styles.teamScore}>{team === "A" ? s.a : s.b}</Text>
              <Text style={[styles.serving, { color: t.ball }]}>
                {serving ? (doubles && rules.system === "sideout" ? `Serving, server ${s.serverNumber}` : "Serving") : " "}
              </Text>
              {rules.bestOf > 1 && <Text style={styles.games}>Games {s.gamesWon[team]}</Text>}
            </Pressable>
          );
        })}
      </View>
      <Body muted>Tap the team that won the rally.</Body>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <PrimaryButton title="Undo" tone="court" disabled={!started} onPress={() => push({ type: "UNDO", at: Date.now() })} />
        </View>
        <View style={{ flex: 1 }}>
          <PrimaryButton title="New game" disabled={!started} onPress={() => setEvents([])} />
        </View>
      </View>
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? t.court : t.surface, borderColor: t.line }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={{ color: active ? "#fff" : t.ink, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  callout: { fontSize: 64, fontWeight: "900", textAlign: "center", fontVariant: ["tabular-nums"] },
  banner: { fontSize: 24, fontWeight: "800", textAlign: "center", borderRadius: 12, paddingVertical: 10, overflow: "hidden" },
  point: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  teams: { gap: 12 },
  team: { minHeight: 170, borderRadius: 18, borderWidth: 4, alignItems: "center", justifyContent: "center", padding: 12 },
  teamName: { color: "#fff", fontSize: 18, fontWeight: "600" },
  teamScore: { color: "#fff", fontSize: 88, fontWeight: "900", fontVariant: ["tabular-nums"] },
  serving: { fontSize: 14, fontWeight: "700" },
  games: { color: "rgba(255,255,255,0.75)", marginTop: 4 },
  row: { flexDirection: "row", gap: 12 },
});
