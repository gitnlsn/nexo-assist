import { tokenize } from "@/shared/rules/tickets";

/** The Nexo help center (central de ajuda). Small, static knowledge base searched with keyword scoring. */
export interface Article {
  id: string;
  title: string;
  tags: string[];
  body: string;
}

export const ARTICLES: Article[] = [
  {
    id: "KB-001",
    title: "VPN com erro 809",
    tags: ["vpn", "809", "conexao", "windows 10", "rede", "remoto"],
    body:
      "Reinstale o cliente de VPN pelo portal de softwares (software.nexo.com.br) e reinicie o computador. " +
      "Vale apenas para Windows 10; no Windows 11, abra um chamado.",
  },
  {
    id: "KB-002",
    title: "Horário do service desk",
    tags: ["horario", "atendimento", "plantao", "service desk", "funcionamento"],
    body:
      "De segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
  },
  {
    id: "KB-003",
    title: "Senha bloqueada ou esquecida (rede, e-mail e SAP)",
    tags: ["senha", "bloqueada", "esqueci", "sap", "login", "acesso", "redefinir"],
    body:
      "Acesse senha.nexo.com.br, informe seu e-mail corporativo e confirme o código enviado ao celular cadastrado no MFA. " +
      "A nova senha vale para rede, e-mail e SAP em até 15 minutos. Se o celular cadastrado não estiver com você, abra um chamado.",
  },
  {
    id: "KB-004",
    title: "Configurar o e-mail corporativo no celular",
    tags: ["email", "e-mail", "celular", "outlook", "android", "iphone", "sincronizar"],
    body:
      "Instale o app Outlook, entre com o e-mail corporativo e aprove o acesso no Authenticator. " +
      "Outros aplicativos de e-mail não são permitidos. Se o Outlook não sincronizar, remova a conta e adicione de novo.",
  },
  {
    id: "KB-005",
    title: "Adicionar uma impressora do escritório",
    tags: ["impressora", "imprimir", "impressao", "andar", "fila"],
    body:
      "No Windows, abra Configurações > Impressoras e adicione \\\\print.nexo.local\\<andar>, por exemplo \\\\print.nexo.local\\3andar. " +
      "Se a impressora aparecer offline para todo o andar, abra um chamado.",
  },
  {
    id: "KB-006",
    title: "Instalar ou solicitar um software",
    tags: ["software", "instalar", "programa", "licenca", "aplicativo", "portal"],
    body:
      "Softwares gratuitos homologados estão no portal de softwares (software.nexo.com.br) e instalam sozinhos. " +
      "Softwares pagos ou fora do portal precisam de uma requisição com aprovação do gestor.",
  },
  {
    id: "KB-007",
    title: "Wi-Fi corporativo não conecta",
    tags: ["wifi", "wi-fi", "rede", "internet", "sem fio", "nexo-corp"],
    body:
      "Conecte-se à rede Nexo-Corp com seu e-mail e senha de rede. Se pedir certificado, aceite o certificado 'nexo-radius'. " +
      "Visitantes usam a rede Nexo-Guest com o código da recepção.",
  },
  {
    id: "KB-008",
    title: "Trocar o celular do MFA (Authenticator)",
    tags: ["mfa", "authenticator", "celular", "autenticacao", "token", "novo celular"],
    body:
      "Com o celular antigo em mãos, acesse mfa.nexo.com.br e adicione o novo aparelho. " +
      "Sem o celular antigo, é preciso abrir uma requisição de acesso para o service desk validar sua identidade.",
  },
];

export interface ArticleHit {
  article: Article;
  score: number;
}

export function searchArticles(query: string, limit = 3): ArticleHit[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  return ARTICLES.map((article) => {
    const title = new Set(tokenize(article.title));
    const tags = new Set(article.tags.flatMap((t) => tokenize(t)));
    const body = new Set(tokenize(article.body));
    let score = 0;
    for (const t of terms) {
      if (tags.has(t)) score += 3;
      if (title.has(t)) score += 2;
      if (body.has(t)) score += 1;
    }
    return { article, score: score / terms.length };
  })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
