"use client";

import type { MensagemChat } from "./api";

const KEY = "allwin_consultas_chat_v1";

export interface ConsultaSalva {
  id:        string;
  nome:      string;
  ticker:    string;
  empresa:   string;
  setor?:    string;
  score?:    number;
  timestamp: number;
  mensagens: MensagemChat[];
}

export function getConsultas(): ConsultaSalva[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as ConsultaSalva[];
  } catch {
    return [];
  }
}

export function salvarConsulta(
  dados: Omit<ConsultaSalva, "id" | "timestamp">,
): ConsultaSalva {
  const nova: ConsultaSalva = {
    ...dados,
    id:        `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };
  const lista = getConsultas();
  localStorage.setItem(KEY, JSON.stringify([nova, ...lista]));
  return nova;
}

export function deletarConsulta(id: string): void {
  const lista = getConsultas().filter(c => c.id !== id);
  localStorage.setItem(KEY, JSON.stringify(lista));
}

export function gerarPDF(consulta: ConsultaSalva): void {
  const data = new Date(consulta.timestamp).toLocaleString("pt-BR");
  const linhas = consulta.mensagens
    .map(m => {
      const quem = m.papel === "usuario" ? "Você" : "Analista IA";
      const bg   = m.papel === "usuario" ? "#f0fdf4" : "#f8fafc";
      const bord = m.papel === "usuario" ? "#10b981" : "#94a3b8";
      return `
        <div style="margin:12px 0;padding:12px 14px;border-radius:8px;
          background:${bg};border-left:3px solid ${bord};">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;
            color:#6b7280;margin-bottom:6px;">${quem}</div>
          <div style="font-size:13px;line-height:1.6;color:#1e293b;
            white-space:pre-wrap;">${m.conteudo.replace(/</g, "&lt;")}</div>
        </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${consulta.nome}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 760px;
           margin: 0 auto; padding: 28px 24px; color: #1e293b; }
    .header { border-bottom: 2px solid #10b981; padding-bottom: 14px; margin-bottom: 20px; }
    .header h1 { margin: 0 0 6px; font-size: 20px; color: #0f172a; }
    .header .meta { font-size: 12px; color: #64748b; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0;
              font-size: 10px; color: #94a3b8; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${consulta.nome}</h1>
    <div class="meta">
      <strong>${consulta.ticker}</strong> — ${consulta.empresa}
      ${consulta.setor ? ` · ${consulta.setor}` : ""}
      ${consulta.score != null ? ` · RS Score ${consulta.score}/1000` : ""}
      <br>Salvo em ${data}
    </div>
  </div>
  ${linhas}
  <div class="footer">
    Gerado pela plataforma AllWin · ${data}<br>
    Esta análise é gerada automaticamente a partir de dados públicos e não constitui recomendação de investimento.
  </div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  // Espera o conteúdo renderizar antes de abrir o print dialog
  setTimeout(() => win.print(), 400);
}
