"use client";

import { LogOut, MessageSquare, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, NexoMark, cx } from "@/components/ui";

const NAV = [
  { href: "/chat", label: "Atendimento", icon: MessageSquare },
  { href: "/perfil", label: "Meu perfil", icon: User },
];

export function EmployeeSidebar({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="hidden w-[260px] shrink-0 flex-col border-r border-line px-3.5 pt-5 pb-4 md:flex">
      <div className="mb-6 flex items-center gap-2.5 px-2.5">
        <NexoMark className="h-[18px] w-[22px]" color="#0285F7" />
        <span className="text-[16px] font-bold">Nexo Assist</span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cx(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px]",
                active ? "bg-primary-soft font-semibold text-primary" : "text-ink-2 hover:bg-canvas",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-line pt-4">
        <div className="flex items-center gap-2.5 px-2">
          <Avatar name={name} size={34} />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold">{name}</div>
            <div className="truncate text-[12px] text-muted">{email}</div>
          </div>
        </div>
        <button onClick={logout} className="mt-3 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] text-muted hover:bg-canvas">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </aside>
  );
}
