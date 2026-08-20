import type { ItemState, Priority } from "@cvg/contracts";

const statusLabels: Record<ItemState, string> = {
  REQUESTED: "Solicitado",
  RECEIVED: "Amostra recebida",
  SCHEDULED: "Agendado",
  IN_PROGRESS: "Em execução",
  AWAITING_REPORT: "Aguardando laudo",
  RESULT_AVAILABLE: "Resultado disponível",
  REVIEWED: "Revisado",
  COMPLETED: "Concluído",
  RECOLLECTION_REQUIRED: "Recoleta necessária",
  FAILED: "Pendente",
  CANCELLED: "Cancelado",
  REJECTED: "Rejeitado",
  RESULT_VOIDED: "Resultado invalidado"
};

const statusTone: Record<ItemState, string> = {
  REQUESTED: "neutral",
  RECEIVED: "info",
  SCHEDULED: "info",
  IN_PROGRESS: "accent",
  AWAITING_REPORT: "accent",
  RESULT_AVAILABLE: "success",
  REVIEWED: "success",
  COMPLETED: "success",
  RECOLLECTION_REQUIRED: "warning",
  FAILED: "danger",
  CANCELLED: "muted",
  REJECTED: "danger",
  RESULT_VOIDED: "danger"
};

const priorityLabels: Record<Priority, string> = { ROUTINE: "Rotina", URGENT: "Urgente", EMERGENCY: "Emergência" };

export function StatusBadge({ status }: { status: ItemState }) {
  return <span className={`status-badge status-${statusTone[status]}`}><span aria-hidden="true" className="status-dot" />{statusLabels[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`priority-badge priority-${priority.toLowerCase()}`}><span aria-hidden="true">{priority === "EMERGENCY" ? "!" : priority === "URGENT" ? "↑" : "•"}</span>{priorityLabels[priority]}</span>;
}

export function statusLabel(status: ItemState): string {
  return statusLabels[status];
}
