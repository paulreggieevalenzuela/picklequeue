import type { Metadata } from "next";
import { MyStatus } from "@/components/MyStatus";

export const metadata: Metadata = { title: "My status" };

export default async function Page(props: PageProps<"/s/[id]/me/[playerId]">) {
  const { id, playerId } = await props.params;
  return <MyStatus sessionId={id} playerId={playerId} />;
}
