import type { Metadata } from "next";
import { StatsScreen } from "@/components/StatsScreen";

export const metadata: Metadata = { title: "Stats" };

export default async function Page(props: PageProps<"/s/[id]/stats">) {
  const { id } = await props.params;
  return <StatsScreen sessionId={id} />;
}
