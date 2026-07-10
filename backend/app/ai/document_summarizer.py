"""
Monta contexto e prompts para o Resumo Inteligente de Documentos (Feature 4).
"""
from __future__ import annotations

from typing import Any

_SENTIMENTO_HINT: dict[str, str] = {
    "Fato Relevante":          "pode ser positivo ou negativo — depende do conteúdo",
    "DFP":                     "balanço anual completo — importante para análise fundamentalista",
    "ITR":                     "resultado trimestral — impacto imediato na cotação",
    "FRE":                     "informações sobre a empresa e estratégia",
    "Comunicado ao Mercado":   "geralmente é neutro ou esclarece algum evento",
    "Aviso aos Acionistas":    "operação societária iminente (dividendo, AGO, AGE, etc.)",
    "Assembleia":              "votação de propostas importantes — pode impactar governança",
}

_JSON_SCHEMA_DOC = """{
  "resumos": [
    {
      "id_doc": "<id do documento>",
      "resumo_executivo": "<3–5 linhas explicando do que trata e o que o investidor deve saber>",
      "sentimento": "positivo | neutro | negativo",
      "topicos": ["<tópico 1>", "<tópico 2>", "<tópico 3>"],
      "impacto_esperado": "<breve descrição do impacto potencial na cotação ou nos fundamentos>"
    }
  ]
}"""


def build_docs_context(
    docs: list[dict[str, Any]],
    dados_empresa: dict[str, Any] | None,
) -> str:
    """Gera bloco de texto com metadados dos documentos para o LLM."""
    linhas: list[str] = ["═" * 60, "DOCUMENTOS RECENTES — CVM/B3", "═" * 60, ""]

    # Contexto da empresa (se disponível)
    if dados_empresa:
        ticker  = dados_empresa.get("ticker", "")
        empresa = dados_empresa.get("empresa", "")
        setor   = dados_empresa.get("setor", "N/D")
        score   = (dados_empresa.get("score") or {}).get("score_total")
        nota    = (dados_empresa.get("score") or {}).get("nota_geral", "")
        preco   = (dados_empresa.get("cotacao") or {}).get("preco_atual")

        linhas += [
            f"EMPRESA: {empresa} ({ticker})",
            f"Setor: {setor}",
            f"RS Score: {score}/1000 ({nota})" if score else "",
            f"Preço atual: R$ {preco:.2f}" if preco else "",
            "",
        ]

    linhas.append(f"Total de documentos: {len(docs)}")
    linhas.append("")

    for i, doc in enumerate(docs, 1):
        categ = doc.get("categoria", "")
        hint = _SENTIMENTO_HINT.get(categ.split(" — ")[0], "")
        linhas += [
            f"[{i}] ID: {doc.get('id_doc', 'N/D')}",
            f"    Categoria: {categ}",
            f"    Tipo: {doc.get('tipo', '')}",
            f"    Descrição: {doc.get('descricao', '')}",
            f"    Data recebimento: {doc.get('data_recebimento', '')}",
            f"    Data referência: {doc.get('data_referencia', '')}",
            f"    Contexto de sentimento: {hint}" if hint else "",
        ]
        conteudo = doc.get("conteudo_extraido")
        if conteudo:
            linhas.append(f"    Trecho do conteúdo: {conteudo[:800]}")
        linhas.append("")

    linhas.append("═" * 60)
    return "\n".join(l for l in linhas if l is not None)


def build_docs_system_prompt(empresa: str) -> str:
    return f"""Você é um analista de equity research especializado em documentos regulatórios da CVM/B3.
Sua tarefa é resumir documentos recentes de {empresa} para um investidor de varejo.

REGRAS ABSOLUTAS:
1. NUNCA invente dados ou afirme algo além do que está na descrição/conteúdo fornecido.
2. Se o conteúdo do documento não foi fornecido, baseie o resumo APENAS na categoria e na descrição.
3. O sentimento deve ser: "positivo" (boas notícias / resultados fortes),
   "negativo" (riscos / resultados fracos / eventos adversos) ou "neutro" (operacional / burocrático).
4. Seja conciso: máximo 5 linhas no resumo_executivo.
5. Responda APENAS em JSON válido conforme o schema, sem texto antes ou depois.
6. Inclua exatamente um objeto por documento recebido, na mesma ordem.

SCHEMA OBRIGATÓRIO:
{_JSON_SCHEMA_DOC}"""


def build_docs_user_message(contexto: str) -> str:
    return (
        "Resuma os documentos listados abaixo conforme o schema. "
        "Use as informações da empresa como contexto para avaliar o impacto.\n\n"
        f"{contexto}"
    )
