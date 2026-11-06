import { redirect } from "next/navigation";
import { NexoMark } from "@/components/ui";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "analyst" ? "/console" : "/chat");

  return (
    <main className="flex min-h-full">
      {/* Showcase */}
      <section className="hidden w-[55%] max-w-[800px] flex-col justify-between bg-ink px-16 pt-10 pb-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <NexoMark className="h-5 w-6" color="#fff" />
          <span className="text-[17px] font-bold tracking-[-0.2px]">Nexo Assist</span>
        </div>

        <div className="flex flex-col gap-9">
          <div className="flex flex-col gap-[18px]">
            <span className="text-[13.5px] font-medium text-white/55">Service desk de TI da Nexo</span>
            <h1 className="font-serif text-[54px] leading-[56px] tracking-[-1.2px]">
              Seu problema de TI, resolvido em uma conversa.
            </h1>
            <p className="max-w-[520px] text-[16px] leading-[25px] text-white/65">
              Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um
              analista quando precisa.
            </p>
          </div>

          <div className="pl-24">
            <div className="flex w-[500px] flex-col gap-2.5 rounded-2xl bg-white/[0.04] p-[18px] outline outline-white/[0.08]">
              <div className="flex justify-end">
                <div className="rounded-[12px_12px_4px_12px] bg-white px-3.5 py-2 text-[13.5px] text-ink">
                  Meu notebook não conecta na VPN. Erro 809.
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1.5 text-[12.5px]">
                  <span className="font-semibold text-white/80">Nexo Assist</span>
                  <span className="text-white/45">consultou seus chamados · criou um chamado</span>
                </div>
                <div className="w-[380px] rounded-[4px_12px_12px_12px] bg-white/[0.08] px-3.5 py-2.5 text-[13.5px] leading-5">
                  Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
                </div>
                <div className="flex w-fit items-center gap-2 rounded-xl bg-white px-3 py-[7px] text-[12.5px]">
                  <span className="h-[7px] w-[7px] rounded-full bg-warn" />
                  <span className="font-semibold text-ink">INC-20517</span>
                  <span className="text-muted">Rede e VPN · Alta · em até 4 h</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 border-t border-white/10 pt-6">
          {[
            ["8 s", "primeira resposta, em média"],
            ["72%", "resolvidos sem fila"],
            ["6", "analistas online agora"],
          ].map(([value, label], i) => (
            <div key={label} className={i > 0 ? "border-l border-white/10 pl-6" : ""}>
              <div className="flex items-center gap-2 font-serif text-[34px]">
                {value}
                {i === 2 && <span className="h-2 w-2 rounded-full bg-ok" />}
              </div>
              <div className="text-[13.5px] text-white/60">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Form */}
      <section className="flex flex-1 flex-col px-6 py-10 sm:px-14">
        <div className="flex justify-end text-[13.5px] text-muted">
          Problema para entrar?&nbsp;<span className="font-semibold text-primary">Ligue no ramal 4000</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[380px]">
            <div className="mb-8 flex items-center gap-2 lg:hidden">
              <NexoMark className="h-5 w-6" color="#0285F7" />
              <span className="text-[17px] font-bold">Nexo Assist</span>
            </div>
            <h2 className="font-serif text-[40px] leading-tight">Entrar</h2>
            <p className="mt-2 mb-7 text-[15px] text-muted">Use seu e-mail corporativo e a senha da rede Nexo.</p>
            <LoginForm />
          </div>
        </div>
        <div className="flex justify-between text-[12.5px] text-muted">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </div>
      </section>
    </main>
  );
}
