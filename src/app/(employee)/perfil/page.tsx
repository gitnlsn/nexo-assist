import { KeyRound, Lock, Mail, RotateCcw } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { Breadcrumb } from "../breadcrumb";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <Breadcrumb current="Meu perfil" />
      <main className="flex-1 overflow-y-auto px-6 py-14">
        <div className="mx-auto max-w-[600px]">
          <h1 className="text-[26px] font-bold tracking-[-0.4px]">Meu perfil</h1>
          <p className="mt-1 text-[15px] text-muted">Seus dados de acesso ao service desk de TI.</p>

          <div className="mt-8 rounded-2xl border border-line shadow-[0_1px_3px_rgba(27,36,49,0.06)]">
            {[
              ["Nome", user.name, null],
              ["Área", `${user.department} · ${user.title}`, null],
              ["E-mail corporativo", user.email, "Gerenciado pela TI"],
            ].map(([label, value, note], i) => (
              <div key={label} className={`flex items-center gap-6 px-6 py-5 ${i > 0 ? "border-t border-line" : ""}`}>
                <span className="w-40 shrink-0 text-[14px] text-muted">{label}</span>
                <span className="flex-1 text-[15px] font-medium">{value}</span>
                {note && (
                  <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                    <Lock className="h-3.5 w-3.5" /> {note}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-line shadow-[0_1px_3px_rgba(27,36,49,0.06)]">
            <div className="flex items-center gap-4 px-6 py-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-canvas">
                <KeyRound className="h-4 w-4 text-ink-2" />
              </div>
              <div className="flex-1">
                <div className="text-[15px] font-semibold">Senha</div>
                <div className="text-[13.5px] text-muted">Gerenciada no portal senha.nexo.com.br</div>
              </div>
              <span className="flex items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-[14px] font-semibold">
                <RotateCcw className="h-4 w-4" /> Redefinir senha
              </span>
            </div>
            <div className="flex items-center gap-2 border-t border-line bg-canvas px-6 py-3.5 text-[13px] text-muted">
              <Mail className="h-4 w-4" /> Enviaremos um link de redefinição para {user.email}.
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
