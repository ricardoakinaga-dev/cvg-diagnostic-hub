"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, getSafeErrorMessage } from "./api-client";

interface Patient { id: string; displayName: string; species: string; breed: string; sex: string; externalId: string; ownerLabel: string; active: boolean }

export function PatientList() {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try { setError(""); setPatients(await apiFetch<Patient[]>(`/patients?q=${encodeURIComponent(query)}`)); }
    catch (cause) { setError(getSafeErrorMessage(cause, "Não foi possível carregar os pacientes.")); }
    finally { setLoading(false); }
  }, [query]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 180); return () => window.clearTimeout(timer); }, [load]);

  return <div className="patient-page"><div className="page-heading"><div><p className="eyebrow">Contexto de cuidado</p><h1>Meus <em>pacientes.</em></h1><p className="page-lede">Identidade mínima, atendimento e próximos passos dentro do seu escopo.</p></div></div><div className="search-bar"><span aria-hidden="true">⌕</span><input aria-label="Buscar pacientes" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nome, identificador ou tutor…" /></div>{error && <div className="error-state" role="alert"><span>{error}</span><button className="button button-ghost" onClick={() => void load()}>Tentar novamente</button></div>}{loading ? <div className="panel resource-loading" role="status">Carregando pacientes…</div> : patients.length === 0 ? <div className="panel empty-state"><span aria-hidden="true">✓</span><strong>Nenhum paciente atribuído</strong><p>Refine a busca ou confirme o escopo de atendimento.</p></div> : <section className="patient-grid" aria-label="Pacientes autorizados">{patients.map((patient) => <Link href={`/patients/${patient.id}/diagnostics`} className="panel patient-card" key={patient.id}><span className="patient-avatar">{patient.displayName.slice(0, 1)}</span><span className="patient-card-copy"><strong>{patient.displayName}</strong><small>{patient.species} · {patient.sex} · {patient.breed}</small><small>{patient.externalId} · tutor {patient.ownerLabel}</small></span><span className="row-arrow" aria-hidden="true">→</span></Link>)}</section>}
  </div>;
}
