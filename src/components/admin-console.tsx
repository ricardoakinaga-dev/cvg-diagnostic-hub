"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiClientError, apiFetch, getSafeErrorMessage } from "./api-client";

interface CatalogService {
  id: string;
  code: string;
  name: string;
  departmentCode: string;
  workflowType: string;
  active: boolean;
  version: number;
  slaHours: { ROUTINE: number; URGENT: number; EMERGENCY: number };
}

interface ReasonCode {
  id: string;
  type: string;
  code: string;
  label: string;
  active: boolean;
  version: number;
}

export function AdminConsole() {
  const [services, setServices] = useState<CatalogService[]>([]);
  const [reasons, setReasons] = useState<ReasonCode[]>([]);
  const [error, setError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setAccessDenied(false);
    const [serviceResult, reasonResult] = await Promise.allSettled([
      apiFetch<CatalogService[]>("/diagnostic-services?includeInactive=true"),
      apiFetch<ReasonCode[]>("/reason-codes"),
    ]);
    if (serviceResult.status === "fulfilled") setServices(serviceResult.value);
    if (reasonResult.status === "fulfilled") setReasons(reasonResult.value);
    const failures = [serviceResult, reasonResult].filter((result) => result.status === "rejected");
    const denied = failures.length === 2 && failures.every((result) => result.status === "rejected" && result.reason instanceof ApiClientError && result.reason.code === "SCOPE_DENIED");
    setAccessDenied(denied);
    if (failures.length > 0 && !denied) setError("Parte da configuração está indisponível; alterações não confirmadas permanecem sem efeito.");
    setLoading(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  if (loading && services.length === 0 && reasons.length === 0) return <div className="loading-state" role="status">Carregando administração…</div>;

  return (
    <div className="admin-page">
      <div className="page-heading"><div><p className="eyebrow">Configuração controlada</p><h1>Administração <em>sem atalhos.</em></h1><p className="page-lede">Valores clínicos são versionados, desativados e auditados; nada referenciado é apagado.</p></div><button className="button button-ghost" onClick={() => void load()} disabled={loading}>↻ Atualizar</button></div>
      {accessDenied ? <div className="error-state" role="alert"><strong>Administração fora do seu escopo</strong><span>Seu perfil não pode consultar nem alterar o catálogo institucional.</span><Link className="button button-ghost" href="/">Voltar à visão geral</Link></div> : error && <div className="error-state" role="status"><span>{error}</span><button className="button button-ghost" onClick={() => void load()}>Reconciliar</button></div>}
      <section className="admin-policy-banner" role="note"><strong>Gate externo mantido visível</strong><p>A política de resultado crítico, identidade institucional, transferência/alta, retenção e RPO/RTO não é inventada pelo ambiente local. A configuração permanece bloqueada até aprovação e owner do hospital.</p></section>
      <div className="admin-columns">
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Catálogo</p><h2>Serviços diagnósticos</h2></div><span className="timeline-count">{services.length}</span></div>{services.length === 0 ? <div className="empty-state"><span aria-hidden="true">✓</span><strong>Nenhum serviço no escopo de gestão</strong><p>O catálogo só mostra serviços administráveis para este setor.</p></div> : <div className="admin-list">{services.map((service) => <ServiceRow key={service.id} service={service} onSaved={() => void load()} />)}</div>}</section>
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Motivos auditáveis</p><h2>Códigos de motivo</h2></div><span className="timeline-count">{reasons.length}</span></div>{reasons.length === 0 ? <div className="empty-state"><span aria-hidden="true">✓</span><strong>Nenhum motivo configurado</strong><p>Novos códigos devem ser aprovados antes de serem usados em comandos.</p></div> : <div className="admin-list">{reasons.map((reason) => <ReasonRow key={reason.id} reason={reason} onSaved={() => void load()} />)}</div>}</section>
      </div>
    </div>
  );
}

function ServiceRow({ service, onSaved }: { service: CatalogService; onSaved: () => void }) {
  const [name, setName] = useState(service.name);
  const [active, setActive] = useState(service.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/diagnostic-services/${service.id}`, { method: "PATCH", body: JSON.stringify({ name: name.trim(), active, expectedVersion: service.version }) });
      onSaved();
    } catch (cause) {
      setError(getSafeErrorMessage(cause, "Não foi possível salvar o serviço."));
    } finally {
      setBusy(false);
    }
  }

  return <form className="admin-row" onSubmit={(event) => void save(event)}><div className="admin-row-heading"><strong>{service.code}</strong><span className={active ? "text-success" : "text-danger"}>{active ? "Ativo" : "Desativado"}</span></div><small>{service.departmentCode} · {service.workflowType} · v{service.version}</small><label>Nome<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></label><label className="admin-check"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Disponível no catálogo</label><div className="admin-sla"><span>SLA</span><small>Rotina {service.slaHours.ROUTINE}h · urgente {service.slaHours.URGENT}h · emergência {service.slaHours.EMERGENCY}h</small></div>{error && <p className="form-alert" role="alert">{error}</p>}<button className="button button-ghost" type="submit" disabled={busy}>{busy ? "Salvando…" : `Salvar ${service.name}`}</button></form>;
}

function ReasonRow({ reason, onSaved }: { reason: ReasonCode; onSaved: () => void }) {
  const [label, setLabel] = useState(reason.label);
  const [active, setActive] = useState(reason.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/reason-codes/${reason.id}`, { method: "PATCH", body: JSON.stringify({ label: label.trim(), active, expectedVersion: reason.version }) });
      onSaved();
    } catch (cause) {
      setError(getSafeErrorMessage(cause, "Não foi possível salvar o motivo."));
    } finally {
      setBusy(false);
    }
  }

  return <form className="admin-row" onSubmit={(event) => void save(event)}><div className="admin-row-heading"><strong>{reason.code}</strong><span className={active ? "text-success" : "text-danger"}>{active ? "Ativo" : "Desativado"}</span></div><small>{reason.type} · v{reason.version}</small><label>Descrição<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={160} /></label><label className="admin-check"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Disponível para seleção</label>{error && <p className="form-alert" role="alert">{error}</p>}<button className="button button-ghost" type="submit" disabled={busy}>{busy ? "Salvando…" : `Salvar ${reason.code}`}</button></form>;
}
