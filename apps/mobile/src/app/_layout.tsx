import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "@/lib/theme";

export default function RootLayout() {
  const t = useTheme();
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.paper },
          headerTintColor: t.ink,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.paper },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Pickle Queue" }} />
        <Stack.Screen name="score" options={{ title: "Keep score" }} />
        <Stack.Screen name="join/[id]" options={{ title: "Check in" }} />
        <Stack.Screen name="session/[id]/me/[playerId]" options={{ title: "My status" }} />
      </Stack>
    </>
  );
}
