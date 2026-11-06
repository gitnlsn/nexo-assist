"use client";

import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/ui";

const DEMO_USERS = [
  { email: "ana.souza@nexo.com.br", label: "Ana Souza · funcionária" },
  { email: "bruno.tavares@nexo.com.br", label: "Bruno Tavares · funcionário" },
  { email: "fabio.nunes@nexo.com.br", label: "Fábio Nunes · analista N1" },
];

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("ana.souza@nexo.com.br");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: password || "demo" }),
      });
      const data = (await res.json()) as { redirect?: string; error?: string };
      if (!res.ok || !data.redirect) throw new Error(data.error ?? "Não foi possível entrar.");
      router.replace(data.redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="text-[13.5px] font-medium">E-mail corporativo</span>
        <span className="flex items-center gap-2.5 rounded-lg border border-line px-3.5 py-3 focus-within:border-primary-2 focus-within:ring-2 focus-within:ring-primary-2/20">
          <Mail className="h-4 w-4 text-muted" />
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 bg-transparent text-[15px] outline-none"
            placeholder="nome.sobrenome@nexo.com.br"
          />
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="flex justify-between text-[13.5px] font-medium">
          Senha <span className="font-semibold text-primary">Esqueci minha senha</span>
        </span>
        <span className="flex items-center gap-2.5 rounded-lg border border-line px-3.5 py-3 focus-within:border-primary-2 focus-within:ring-2 focus-within:ring-primary-2/20">
          <Lock className="h-4 w-4 text-muted" />
          <input
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 bg-transparent text-[15px] outline-none"
            placeholder="Qualquer senha (demonstração)"
          />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Ocultar senha" : "Mostrar senha"}>
            {show ? <EyeOff className="h-4 w-4 text-muted" /> : <Eye className="h-4 w-4 text-muted" />}
          </button>
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-[13.5px] text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-3.5 text-[15px] font-semibold text-white shadow-[0_2px_6px_rgba(0,98,196,0.25)] hover:bg-[#0056ad] disabled:opacity-70"
      >
        {loading ? <Spinner /> : <>Entrar <ArrowRight className="h-4 w-4" /></>}
      </button>

      <div className="border-t border-line pt-5">
        <p className="mb-2 text-[12.5px] text-muted">Contas de demonstração (qualquer senha):</p>
        <div className="flex flex-wrap gap-2">
          {DEMO_USERS.map((u) => (
            <button
              type="button"
              key={u.email}
              onClick={() => setEmail(u.email)}
              className="rounded-full border border-line px-3 py-1 text-[12.5px] text-ink-2 hover:bg-canvas"
            >
              {u.label}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
