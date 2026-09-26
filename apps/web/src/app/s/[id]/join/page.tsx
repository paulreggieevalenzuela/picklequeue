import type { Metadata } from "next";
import { JoinScreen } from "@/components/JoinScreen";

export const metadata: Metadata = { title: "Check in" };

export default async function Page(props: PageProps<"/s/[id]/join">) {
  const { id } = await props.params;
  return <JoinScreen sessionId={id} />;
}
