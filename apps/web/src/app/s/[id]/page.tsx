import type { Metadata } from "next";
import { Dashboard } from "@/components/Dashboard";

export const metadata: Metadata = { title: "Session" };

export default async function Page(props: PageProps<"/s/[id]">) {
  const { id } = await props.params;
  return <Dashboard sessionId={id} />;
}
