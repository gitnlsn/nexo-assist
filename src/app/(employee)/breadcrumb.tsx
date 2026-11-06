import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function Breadcrumb({ current, right }: { current: string; right?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-8">
      <div className="flex items-center gap-2 text-[14px]">
        <span className="text-muted">Service desk de TI</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted" />
        <span className="font-semibold">{current}</span>
      </div>
      {right}
    </header>
  );
}
