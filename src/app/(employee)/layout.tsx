import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { EmployeeSidebar } from "./sidebar";

export default async function EmployeeLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "employee") redirect("/console");

  return (
    <div className="flex h-full">
      <EmployeeSidebar name={user.name} email={user.email} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
