import { useColorScheme } from "react-native";

/** Same court palette as the web app. */
const light = {
  paper: "#f1f5f3",
  surface: "#ffffff",
  ink: "#0e1a22",
  muted: "#536b7a",
  line: "#d3ded9",
  court: "#1f4e6b",
  courtDeep: "#173c53",
  surround: "#2f6b4f",
  ball: "#d9f24a",
  ballInk: "#1c2400",
  danger: "#b3261e",
};

const dark: typeof light = {
  ...light,
  paper: "#0d171d",
  surface: "#14232b",
  ink: "#e6eeeb",
  muted: "#93a9b5",
  line: "#24404c",
  court: "#2a6a8f",
  courtDeep: "#1f5575",
  surround: "#3c8a66",
  danger: "#f2877e",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
