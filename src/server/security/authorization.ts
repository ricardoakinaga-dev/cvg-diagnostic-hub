import type { Permission, RoleCode } from "@cvg/contracts";

export interface Actor {
  id: string;
  role: RoleCode;
  departmentCode: string;
  patientIds?: ReadonlyArray<string>;
  serviceCodes?: ReadonlyArray<string>;
  active?: boolean;
}

export interface ScopedResource {
  patientId?: string;
  departmentCode?: string;
  serviceCode?: string;
  ownerId?: string;
}

const commonRead: Permission[] = [
  "patient.view",
  "encounter.view",
  "admission.view",
  "request.view",
  "request.list",
  "item.view",
  "result.view",
  "result.history.view",
  "result.view.record",
  "attachment.view",
  "notification.view",
  "diagnostic.timeline.view",
  "timeline.view",
  "search.execute",
  "queue.view",
  "dashboard.view",
  "service.catalog.view",
  "realtime.connect"
];

export const rolePermissions: Record<RoleCode, readonly Permission[]> = {
  ADMIN: [
    ...commonRead,
    "request.create",
    "request.cancel",
    "request.duplicate_override",
    "item.cancel",
    "item.reject",
    "item.complete",
    "result.draft.create",
    "result.draft.edit_own",
    "result.release",
    "result.amend",
    "result.void",
    "result.review",
    "attachment.download",
    "notification.acknowledge",
    "attachment.upload_session",
    "attachment.finalize",
    "procedure.schedule",
    "procedure.reschedule",
    "procedure.start",
    "procedure.mark_performed",
    "sample.receive",
    "sample.process",
    "sample.recollection.request",
    "sample.replacement.receive",
    "service.catalog.manage",
    "sla_policy.manage",
    "critical_result_policy.manage",
    "reason_code.manage",
    "user_role.manage",
    "audit.view",
    "health.liveness",
    "health.readiness"
  ],
  MANAGER: [
    ...commonRead,
    "request.create",
    "request.cancel",
    "request.duplicate_override",
    "item.cancel",
    "item.reject",
    "item.complete",
    "result.draft.create",
    "result.draft.edit_own",
    "result.release",
    "result.amend",
    "result.void",
    "result.review",
    "attachment.download",
    "notification.acknowledge",
    "attachment.upload_session",
    "attachment.finalize",
    "procedure.schedule",
    "procedure.reschedule",
    "procedure.start",
    "procedure.mark_performed",
    "sample.receive",
    "sample.process",
    "sample.recollection.request",
    "sample.replacement.receive",
    "service.catalog.manage",
    "sla_policy.manage",
    "reason_code.manage",
    "audit.view"
  ],
  VETERINARIAN: [
    ...commonRead,
    "request.create",
    "request.cancel",
    "request.duplicate_override",
    "item.cancel",
    "result.review",
    "attachment.download",
    "notification.acknowledge"
  ],
  INPATIENT_TEAM: [
    ...commonRead,
    "request.create",
    "request.cancel",
    "request.duplicate_override",
    "item.cancel",
    "result.review",
    "attachment.download",
    "notification.acknowledge"
  ],
  LAB_TECH: [
    ...commonRead,
    "sample.receive",
    "sample.process",
    "sample.recollection.request",
    "sample.replacement.receive",
    "result.draft.create",
    "result.draft.edit_own",
    "result.release",
    "result.amend",
    "result.void",
    "attachment.download",
    "attachment.upload_session",
    "attachment.finalize",
    "notification.acknowledge",
    "item.reject"
  ],
  RADIOLOGY_TEAM: [
    ...commonRead,
    "procedure.schedule",
    "procedure.reschedule",
    "procedure.start",
    "procedure.mark_performed",
    "result.draft.create",
    "result.draft.edit_own",
    "result.release",
    "result.amend",
    "result.void",
    "attachment.download",
    "attachment.upload_session",
    "attachment.finalize",
    "notification.acknowledge"
  ],
  ULTRASOUND_TEAM: [
    ...commonRead,
    "procedure.schedule",
    "procedure.reschedule",
    "procedure.start",
    "procedure.mark_performed",
    "result.draft.create",
    "result.draft.edit_own",
    "result.release",
    "result.amend",
    "result.void",
    "attachment.download",
    "attachment.upload_session",
    "attachment.finalize",
    "notification.acknowledge"
  ],
  VIEWER: commonRead
};

export function hasPermission(role: RoleCode, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

export function canAccessResource(
  actor: Actor,
  permission: Permission,
  resource: ScopedResource
): boolean {
  if (actor.active === false || !hasPermission(actor.role, permission)) {
    return false;
  }

  if (actor.role === "ADMIN") {
    return true;
  }

  if (resource.ownerId && resource.ownerId === actor.id) {
    return true;
  }

  const patientScopeApplies = ["VETERINARIAN", "INPATIENT_TEAM", "VIEWER"].includes(actor.role);
  if (patientScopeApplies && resource.patientId && !actor.patientIds?.includes(resource.patientId)) {
    return false;
  }

  const serviceScopeApplies = [
    "LAB_TECH",
    "RADIOLOGY_TEAM",
    "ULTRASOUND_TEAM"
  ].includes(actor.role);
  if (serviceScopeApplies && resource.departmentCode && resource.departmentCode !== actor.departmentCode) {
    return false;
  }

  if (
    actor.role === "VETERINARIAN" ||
    actor.role === "INPATIENT_TEAM" ||
    actor.role === "VIEWER"
  ) {
    return resource.patientId ? Boolean(actor.patientIds?.includes(resource.patientId)) : true;
  }

  if (resource.departmentCode && actor.role === "MANAGER") {
    return resource.departmentCode === actor.departmentCode;
  }

  return true;
}
