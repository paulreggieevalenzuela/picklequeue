import { router } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { apiConfigured, findSession } from "@/lib/api";
import { Body, Field, Heading, PrimaryButton } from "@/lib/ui";

export default function Home() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function join() {
    setBusy(true);
    try {
      const id = await findSession(code.trim().toUpperCase());
      if (id) router.push({ pathname: "/join/[id]", params: { id } });
      else Alert.alert("No session found", `Check the code on the organizer's screen. You entered ${code.toUpperCase()}.`);
    } catch {
      Alert.alert("Can't reach the server", "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Heading>Join a session</Heading>
          <Body muted>Enter the 6-letter code shown at the desk or on the courtside screen.</Body>
          <Field
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="ABC234"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            style={styles.code}
          />
          <PrimaryButton title={busy ? "Looking…" : "Join"} onPress={join} disabled={!apiConfigured || busy || code.trim().length < 6} tone="court" />
          {!apiConfigured && <Body muted>Set EXPO_PUBLIC_API_URL to your web app&apos;s address to join sessions.</Body>}
        </View>

        <View style={styles.section}>
          <Heading>Keep score</Heading>
          <Body muted>A courtside scorer for any game. Works without a connection.</Body>
          <PrimaryButton title="Start scoring" onPress={() => router.push("/score")} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 36 },
  section: { gap: 12 },
  code: { fontSize: 28, fontWeight: "800", letterSpacing: 6, textAlign: "center" },
});
