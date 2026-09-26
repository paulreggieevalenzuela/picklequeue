import type { Metadata } from "next";
import { SettingsScreen } from "@/components/SettingsScreen";

export const metadata: Metadata = { title: "Settings" };

export default async function Page(props: PageProps<"/s/[id]/settings">) {
  const { id } = await props.params;
  return <SettingsScreen sessionId={id} />;
}
