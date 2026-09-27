import { getPlayerStatus, type Command, type SessionState } from "@pickle-queue/core";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchSession, sendCommand } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { Body, PrimaryButton } from "@/lib/ui";

const POLL_MS = 5_000;

/**
 * Live "where am I in line" screen. Checks for updates every few seconds;
 * Phase 2 adds native push ("You're up on Court 3").
 */
export default function MyStatus() {
  const { id, playerId } = useLocalSearchParams<{ id: string; playerId: string }>();
  const t = useTheme();
  const [state, setState] = useState<SessionState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const s = await fetchSession(id).catch(() => null);
    if (s) setState(s);
    setNow(Date.now());
  }, [id]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const send = async (cmd: Command) => {
    try {
      setState(await sendCommand(id, cmd));
    } catch (e) {
      Alert.alert("Couldn't update", e instanceof Error ? e.message : "Try again.");
    }
  };

  const view = state ? getPlayerStatus(state, playerId, now) : null;
  if (!view) return <Body muted>{state ? "We couldn't find you in this session." : "Loading…"}</Body>;
  const p = view.player;
  const called = view.liveMatch?.status === "called";

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={[styles.name, { color: t.ink }]}>{p.name}</Text>
      <View style={[styles.card, { backgroundColor: called ? t.ball : t.court }]}>
        {called ? (
          <Text style={[styles.big, { color: t.ballInk }]}>You&apos;re up on {view.courtName}</Text>
        ) : view.liveMatch ? (
          <>
            <Text style={styles.big}>Playing on {view.courtName}</Text>
            {view.liveMatch.startedAt && (
              <Text style={styles.sub}>Game time {Math.floor((now - view.liveMatch.startedAt) / 60000)} min</Text>
            )}
            {p.leaveAfterMatch && <Text style={styles.sub}>You&apos;ll be checked out when this game ends.</Text>}
          </>
        ) : p.status === "resting" || p.status === "away" ? (
          <Text style={styles.big}>{p.status === "resting" ? "Resting" : "Away"}</Text>
        ) : view.entry ? (
          <>
            <Text style={styles.huge}>#{view.entry.position}</Text>
            <Text style={styles.sub}>in line, about {Math.max(0, view.entry.etaMin)} min</Text>
            <Text style={styles.sub}>You&apos;ve waited {view.entry.waitingMin} min</Text>
          </>
        ) : (
          <Text style={styles.big}>Checked out</Text>
        )}
      </View>

      {p.status === "waiting" && (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <PrimaryButton tone="court" title="Take a break" onPress={() => send({ type: "SetRest", playerId, at: Date.now() })} />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton tone="court" title="Step away" onPress={() => send({ type: "SetAway", playerId, at: Date.now() })} />
          </View>
        </View>
      )}
      {(p.status === "resting" || p.status === "away" || p.status === "left") && (
        <PrimaryButton title={p.status === "left" ? "Check back in" : "I'm back"} onPress={() => send({ type: "ReturnPlayer", playerId, at: Date.now() })} />
      )}

      {p.status !== "left" && !p.leaveAfterMatch && (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            Alert.alert(p.status === "playing" ? "Check out after this game?" : "Check out and leave the line?", undefined, [
              { text: "Cancel", style: "cancel" },
              { text: "Check out", style: "destructive", onPress: () => send({ type: "RemovePlayer", playerId, at: Date.now() }) },
            ])
          }
          style={styles.leave}
        >
          <Text style={[styles.leaveText, { color: t.danger }]}>I&apos;m leaving</Text>
        </Pressable>
      )}

      <Body muted>
        {p.gamesPlayed} games, {p.wins} won, points {p.pointsFor}–{p.pointsAgainst}
      </Body>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 16 },
  name: { fontSize: 32, fontWeight: "800" },
  card: { borderRadius: 18, padding: 24, gap: 6 },
  big: { color: "#fff", fontSize: 34, fontWeight: "900" },
  huge: { color: "#fff", fontSize: 72, fontWeight: "900", fontVariant: ["tabular-nums"] },
  sub: { color: "#fff", fontSize: 18 },
  row: { flexDirection: "row", gap: 12 },
  leave: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  leaveText: { fontSize: 17, fontWeight: "700" },
});
