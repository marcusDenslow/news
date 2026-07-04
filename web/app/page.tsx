import { redirect } from "next/navigation";
import { App } from "@/components/App";
import { getSession } from "@/lib/session";

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <App username={session.username} />;
}
