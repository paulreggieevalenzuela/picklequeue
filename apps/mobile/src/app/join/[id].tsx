import { makeId } from "@pickle-queue/core";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { sendCommand } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { Body, Field, Heading, PrimaryButton } from "@/lib/ui";

const SKILLS = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

export default function Join() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const [name, setName] = useState("");
  const [skill, setSkill] = useState(3.0);
  const [busy, setBusy] = useState(false);

  async function checkIn() {
    setBusy(true);
    const playerId = makeId("p_");
    try {
      await sendCommand(id, { type: "AddPlayer", at: Date.now(), player: { id: playerId, name: name.trim(), skill } });
      await AsyncStorage.setItem(`me:${id}`, playerId);
      router.replace({ pathname: "/session/[id]/me/[playerId]", params: { id, playerId } });
    } catch (e) {
      Alert.alert("Couldn't check in", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Heading>Check in</Heading>
      <Field value={name} onChangeText={setName} placeholder="Your name" autoComplete="name" maxLength={40} />
      <Body muted>Skill level</Body>
      <View style={styles.skills}>
        {SKILLS.map((s) => (
          <Pressable
            key={s}
            onPress={() => setSkill(s)}
            accessibilityRole="button"
            accessibilityState={{ selected: s === skill }}
            style={[styles.skill, { borderColor: t.line, backgroundColor: s === skill ? t.court : t.surface }]}
          >
            <Text style={{ color: s === skill ? "#fff" : t.ink, fontWeight: "700", fontSize: 16 }}>{s.toFixed(1)}</Text>
          </Pressable>
        ))}
      </View>
      <PrimaryButton title={busy ? "Checking in…" : "Check in"} onPress={checkIn} disabled={busy || !name.trim()} />
      <Body muted>No account needed. You can rest or step away any time without losing your place.</Body>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 14 },
  skills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  skill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
});
