import type { Metadata } from "next";
import { TvBoard } from "@/components/TvBoard";

export const metadata: Metadata = { title: "Courtside board" };

export default async function Page(props: PageProps<"/s/[id]/tv">) {
  const { id } = await props.params;
  return <TvBoard sessionId={id} />;
}
