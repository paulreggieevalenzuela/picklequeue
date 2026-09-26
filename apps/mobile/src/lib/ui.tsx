import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps } from "react-native";
import { useTheme } from "./theme";

export function PrimaryButton({ title, onPress, disabled, tone = "ball" }: { title: string; onPress: () => void; disabled?: boolean; tone?: "ball" | "court" }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: tone === "ball" ? t.ball : t.court, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: tone === "ball" ? t.ballInk : "#fff" }]}>{title}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.muted}
      {...props}
      style={[styles.input, { borderColor: t.line, backgroundColor: t.surface, color: t.ink }, props.style]}
    />
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.heading, { color: t.ink }]}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const t = useTheme();
  return <Text style={[styles.body, { color: muted ? t.muted : t.ink }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: 10, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 18, fontWeight: "700" },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 18 },
  heading: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  body: { fontSize: 16, lineHeight: 22 },
});
