import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { ConsoleView } from "./console-view";

export default async function ConsolePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "analyst") redirect("/chat");
  return <ConsoleView analyst={{ id: user.id, name: user.name, title: user.title }} />;
}
