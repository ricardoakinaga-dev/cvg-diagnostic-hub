"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, formatRelativeTime } from "./api-client";

interface Stats {
  overdue: number;
  recollections: number;
  newResults: number;
  critical: number;
  totalActive: number;
  updatedAt: string;
}

interface QueueItem {
  id: string;
  status: string;
  priority: string;
  overdue: boolean;
}

interface IndicatorData {
  stats: Stats;
  queue: QueueItem[];
  department: string;
}

const cards: Array<{ key: keyof Pick<Stats, "overdue" | "recollections" | "newResults" | "critical">; label: string; caption: string; tone: string }> = [
  { key: "overdue", label: "Atrasados", caption: "itens fora do SLA", tone: "danger" },
  { key: "recollections", label: "Recoletas", caption: "nova amostra necessária", tone: "warning" },
  { key: "newResults", label: "Resultados novos", caption: "aguardam revisão", tone: "success" },
  { key: "critical", label: "Críticos", caption: "confirmação necessária", tone: "critical" },
];

export function IndicatorsView() {
  const [data, setData] = useState<IndicatorData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const dataRef = useRef<IndicatorData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let sessionFailed = false;
    let department = dataRef.current?.department ?? "não identificado";
    try {
      const session = await apiFetch<{ user: { departmentCode: string } }>("/session/me");
      department = session.user.departmentCode;
    } catch {
      sessionFailed = true;
    }
    const [stats, queue] = await Promise.allSettled([
      apiFetch<Stats>("/dashboard"),
      apiFetch<QueueItem[]>(`/queues/${encodeURIComponent(department)}/items?limit=100`),
    ]);
    if (stats.status === "fulfilled") {
      const nextData = { stats: stats.value, queue: queue.status === "fulfilled" ? queue.value : dataRef.current?.queue ?? [], department };
      dataRef.current = nextData;
      setData(nextData);
    }
    const failedCount = Number(sessionFailed) + Number(stats.status === "rejected") + Number(queue.status === "rejected");
    if (failedCount > 0) setError(failedCount === 3 ? "Não foi possível carregar os indicadores." : "Parte dos indicadores está indisponível; os dados visíveis podem estar desatualizados.");
    if (stats.status === "rejected" && !dataRef.current) setData(null);
    setLoading(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  if (!data && loading) return <div className="loading-state" role="status">Carregando indicadores…</div>;
  if (!data) return <div className="error-state" role="alert"><strong>Indicadores indisponíveis</strong><span>{error}</span><button className="button button-ghost" onClick={() => void load()}>Tentar novamente</button></div>;

  return (
    <div className="indicators-page">
      <div className="page-heading">
        <div><p className="eyebrow">Operação · visão de capacidade</p><h1>Indicadores <em>operacionais.</em></h1><p className="page-lede">Leitura do escopo autorizado, sem transformar o Hub em um painel de BI.</p></div>
        <button className="button button-ghost" onClick={() => void load()} disabled={loading}>↻ Atualizar</button>
      </div>
      {error && <div className="error-state" role="status"><span>{error}</span><button className="button button-ghost" onClick={() => void load()}>Reconciliar</button></div>}
      <section className="indicator-meta" aria-label="Contexto dos indicadores"><span>Setor: {data.department}</span><span>Janela: estado atual</span><span>Fuso: America/Sao_Paulo</span><span>Atualizado {formatRelativeTime(data.stats.updatedAt)}</span></section>
      <section className="metric-grid indicator-grid" aria-label="Indicadores operacionais">{cards.map((card) => <article className={`metric-card metric-${card.tone}`} key={card.key}><div className="metric-top"><span>{card.label}</span></div><strong>{data.stats[card.key]}</strong><small>{card.caption}</small></article>)}<article className="metric-card metric-info"><div className="metric-top"><span>Ativos</span></div><strong>{data.stats.totalActive}</strong><small>itens não terminais</small></article></section>
      <div className="indicator-columns">
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Fila autorizada</p><h2>{data.queue.length} itens no setor</h2></div><span className="timeline-count">agora</span></div>{data.queue.length === 0 ? <div className="empty-state"><span aria-hidden="true">✓</span><strong>Nenhum item na fila deste setor</strong><p>O estado vazio é real para o escopo atual; nenhuma métrica foi estimada.</p></div> : <ul className="indicator-list">{data.queue.slice(0, 10).map((item) => <li key={item.id}><span><strong>{item.status.replaceAll("_", " ")}</strong><small>{item.priority}{item.overdue ? " · atrasado" : ""}</small></span><span className={item.overdue ? "text-danger" : "text-success"}>{item.overdue ? "Fora do SLA" : "No prazo"}</span></li>)}</ul>}</section>
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Definições</p><h2>Leitura honesta</h2></div></div><div className="indicator-copy"><p><strong>Atrasado</strong> é item não terminal cujo prazo calculado já passou.</p><p><strong>Crítico</strong> conta notificações críticas não confirmadas no escopo do usuário.</p><p className="indicator-muted">Não há distribuição de tempo de resposta disponível neste ambiente.</p></div></section>
      </div>
    </div>
  );
}
