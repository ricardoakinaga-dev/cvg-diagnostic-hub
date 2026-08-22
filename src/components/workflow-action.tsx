"use client";

import Link from "next/link";
import { useState } from "react";
import type { ItemState, WorkflowType } from "@cvg/contracts";
import { apiFetch, getSafeErrorMessage } from "./api-client";

export type WorkflowActionKind =
  | "RECEIVE_SAMPLE"
  | "START_PROCESSING"
  | "START_PROCEDURE"
  | "SCHEDULE"
  | "MARK_PERFORMED"
  | "CREATE_RESULT"
  | "REVIEW_RESULT"
  | "RECEIVE_REPLACEMENT";

export interface WorkflowActionItem {
  id: string;
  status: ItemState;
  workflowType: WorkflowType;
  version: number;
  currentResultId?: string;
  currentSampleId?: string;
}

export function workflowActionFor(item: Pick<WorkflowActionItem, "status" | "workflowType" | "currentResultId" | "currentSampleId">): WorkflowActionKind | undefined {
  if (item.status === "REQUESTED" && item.workflowType === "LABORATORY") return "RECEIVE_SAMPLE";
  if (item.status === "REQUESTED" && item.workflowType === "RADIOLOGY") return "START_PROCEDURE";
  if (item.status === "REQUESTED" && item.workflowType === "ULTRASOUND") return "SCHEDULE";
  if (item.status === "RECEIVED") return "START_PROCESSING";
  if (item.status === "SCHEDULED") return "START_PROCEDURE";
  if (item.status === "IN_PROGRESS" && item.workflowType === "LABORATORY") return "CREATE_RESULT";
  if (item.status === "IN_PROGRESS" && item.workflowType !== "LABORATORY") return "MARK_PERFORMED";
  if (item.status === "AWAITING_REPORT") return "CREATE_RESULT";
  if (item.status === "RESULT_AVAILABLE" && item.currentResultId) return "REVIEW_RESULT";
  if (item.status === "RECOLLECTION_REQUIRED" && item.currentSampleId) return "RECEIVE_REPLACEMENT";
  return undefined;
}

const actionLabel: Record<WorkflowActionKind, string> = {
  RECEIVE_SAMPLE: "Receber amostra",
  START_PROCESSING: "Iniciar processamento",
  START_PROCEDURE: "Iniciar procedimento",
  SCHEDULE: "Agendar exame",
  MARK_PERFORMED: "Marcar realizado",
  CREATE_RESULT: "Registrar resultado",
  REVIEW_RESULT: "Abrir resultado",
  RECEIVE_REPLACEMENT: "Receber recoleta"
};

export function WorkflowAction({ item, onComplete }: { item: WorkflowActionItem; onComplete?: () => void }) {
  const action = workflowActionFor(item);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accessionCode, setAccessionCode] = useState("");
  const [sampleType, setSampleType] = useState("EDTA");
  const [narrative, setNarrative] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [resource, setResource] = useState("");
  const [draft, setDraft] = useState<{ id: string; version: number }>();

  if (!action) return <span className="next-action">Sem ação disponível</span>;
  if (action === "REVIEW_RESULT" && item.currentResultId) {
    return <Link className="button button-ghost workflow-action-link" href={`/results/${item.currentResultId}`}>{actionLabel[action]} →</Link>;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    if ((action === "RECEIVE_SAMPLE" || action === "RECEIVE_REPLACEMENT") && !accessionCode.trim()) {
      setError("Informe o accession da amostra.");
      setBusy(false);
      return;
    }
    if (action === "SCHEDULE" && (!startsAt || !endsAt || !resource.trim())) {
      setError("Informe janela e recurso da agenda.");
      setBusy(false);
      return;
    }
    if (action === "CREATE_RESULT" && !narrative.trim()) {
      setError("Informe o texto do resultado.");
      setBusy(false);
      return;
    }
    try {
      if (action === "RECEIVE_SAMPLE" || action === "RECEIVE_REPLACEMENT") {
        const path = action === "RECEIVE_SAMPLE" ? `/diagnostic-items/${item.id}/receive-sample` : `/samples/${item.currentSampleId}/receive-replacement`;
        await apiFetch(path, { method: "POST", body: JSON.stringify({ accessionCode: accessionCode.trim().toUpperCase(), sampleType, expectedVersion: item.version }) });
      } else if (action === "SCHEDULE") {
        await apiFetch(`/diagnostic-items/${item.id}/schedule`, { method: "POST", body: JSON.stringify({ startsAt, endsAt, resource: resource.trim(), expectedVersion: item.version }) });
      } else if (action === "CREATE_RESULT") {
        const result = await apiFetch<{ result: { id: string; version: number } }>(`/diagnostic-items/${item.id}/results`, { method: "POST", body: JSON.stringify({ narrative: narrative.trim(), content: {}, expectedVersion: item.version }) });
        setDraft(result.result);
        setNotice("Draft salvo. Confirme a liberação quando estiver pronto.");
        return;
      } else if (action === "START_PROCESSING") {
        await apiFetch(`/diagnostic-items/${item.id}/start-processing`, { method: "POST", body: JSON.stringify({ expectedVersion: item.version }) });
      } else if (action === "START_PROCEDURE") {
        await apiFetch(`/diagnostic-items/${item.id}/start-procedure`, { method: "POST", body: JSON.stringify({ expectedVersion: item.version }) });
      } else if (action === "MARK_PERFORMED") {
        await apiFetch(`/diagnostic-items/${item.id}/mark-performed`, { method: "POST", body: JSON.stringify({ expectedVersion: item.version }) });
      }
      setOpen(false);
      onComplete?.();
    } catch (cause) {
      setError(getSafeErrorMessage(cause, "Não foi possível confirmar a ação."));
    } finally {
      setBusy(false);
    }
  }

  async function releaseDraft() {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/results/${draft.id}/release`, { method: "POST", body: JSON.stringify({ expectedVersion: draft.version }) });
      setDraft(undefined);
      setNotice("");
      setOpen(false);
      onComplete?.();
    } catch (cause) {
      setError(getSafeErrorMessage(cause, "Não foi possível liberar o resultado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workflow-action">
      <button className="button button-primary" type="button" onClick={() => { setOpen((value) => !value); setError(""); }} aria-expanded={open}>
        {actionLabel[action]}
      </button>
      {open && <form className="workflow-form" onSubmit={(event) => void submit(event)}>
        {action === "RECEIVE_SAMPLE" || action === "RECEIVE_REPLACEMENT" ? <>
          <label>Accession<input value={accessionCode} onChange={(event) => setAccessionCode(event.target.value)} autoComplete="off" placeholder="ACC-2026-001" /></label>
          <label>Tipo de amostra<input value={sampleType} onChange={(event) => setSampleType(event.target.value)} /></label>
        </> : null}
        {action === "SCHEDULE" ? <>
          <label>Início<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
          <label>Fim<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
          <label>Recurso<input value={resource} onChange={(event) => setResource(event.target.value)} placeholder="US-01" /></label>
        </> : null}
        {action === "CREATE_RESULT" ? <label>Resultado<textarea value={narrative} onChange={(event) => setNarrative(event.target.value)} rows={4} placeholder="Descreva o resultado confirmado pelo setor." /></label> : null}
        {error && <p className="form-alert" role="alert">{error}</p>}
        {notice && <p className="form-notice" role="status">{notice}</p>}
        <div className="workflow-form-actions"><button className="button button-ghost" type="button" onClick={() => setOpen(false)}>Cancelar</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Confirmando…" : "Confirmar"}</button></div>
        {draft && <button className="button button-primary" type="button" onClick={() => void releaseDraft()} disabled={busy}>Liberar resultado</button>}
      </form>}
    </div>
  );
}
