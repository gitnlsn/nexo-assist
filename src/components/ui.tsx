import type { ReactNode } from "react";
import type { Priority, TicketStatus } from "@/shared/domain";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function NexoMark({ className = "h-5 w-5", color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24.388 20.639" className={className} aria-hidden>
      <path
        d="M21.763 .245l-3.374 1.687c-.623 .308-.973 .903-.973 1.631v6.293l-11.193-9.429c-.623-.469-1.372-.553-2.03-.245l-3.185 1.631c-.651 .322-1.008 .924-1.008 1.673v15.218c0 1.477 1.526 2.289 2.716 1.785l3.073-1.617c.693-.322 1.057-.952 1.057-1.722v-7.7l11.732 10.591c.602 .546 1.421 .679 2.086 .364l2.786-1.505c.602-.315 .938-.931 .938-1.68v-15.288c0-1.463-1.505-2.275-2.625-1.687z"
        fill={color}
      />
    </svg>
  );
}

const AVATAR_TONES = [
  "bg-[#E3EEFB] text-[#0062C4]",
  "bg-[#FBE8DD] text-[#B4531F]",
  "bg-[#ECE8FB] text-[#5B45C4]",
  "bg-[#E1F5EA] text-[#16794A]",
  "bg-[#FBE3EA] text-[#B4234F]",
  "bg-[#EEF0F3] text-[#3D4656]",
  "bg-[#FBF0D9] text-[#946300]",
];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = 40, online }: { name: string; size?: number; online?: boolean }) {
  const tone = AVATAR_TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={cx("flex h-full w-full items-center justify-center rounded-full font-semibold", tone)}
        style={{ fontSize: size * 0.36 }}
      >
        {initials(name)}
      </div>
      {online && <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-white bg-ok" />}
    </div>
  );
}

export function Dot({ className }: { className: string }) {
  return <span className={cx("inline-block h-[7px] w-[7px] shrink-0 rounded-full", className)} />;
}

export const PRIORITY_DOT: Record<Priority, string> = {
  Crítica: "bg-danger",
  Alta: "bg-warn",
  Média: "bg-[#9AA1AC]",
  Baixa: "bg-[#C9CED6]",
};

export const STATUS_TONE: Record<TicketStatus, { dot: string; text: string }> = {
  open: { dot: "bg-primary-2", text: "text-primary" },
  in_progress: { dot: "bg-primary-2", text: "text-primary" },
  waiting_analyst: { dot: "bg-warn", text: "text-warn-ink" },
  waiting_user: { dot: "bg-warn", text: "text-warn-ink" },
  approved: { dot: "bg-ok", text: "text-[#16794A]" },
  resolved: { dot: "bg-[#9AA1AC]", text: "text-muted" },
  closed: { dot: "bg-[#C9CED6]", text: "text-muted" },
};

export function Button({
  children,
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; children: ReactNode }) {
  const styles = {
    primary: "bg-primary text-white hover:bg-[#0056ad] disabled:bg-[#9DBFE3]",
    secondary: "border border-line bg-white text-ink hover:bg-canvas disabled:text-muted",
    ghost: "text-ink-2 hover:bg-canvas",
    danger: "bg-danger-soft text-danger hover:bg-[#fbdcd8] border border-[#f7c6c0]",
  }[variant];
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed",
        styles,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" });
const dayTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
export const formatDay = (iso: string) => dayFmt.format(new Date(iso)).replace(".", "");
export const formatDayTime = (iso: string) => dayTimeFmt.format(new Date(iso)).replace(".", "");

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}
