import type { Metadata } from "next";
import { ScorePad } from "@/components/ScorePad";

export const metadata: Metadata = { title: "Scoring" };

export default async function Page(props: PageProps<"/s/[id]/court/[courtId]">) {
  const { id, courtId } = await props.params;
  return <ScorePad sessionId={id} courtId={courtId} />;
}
