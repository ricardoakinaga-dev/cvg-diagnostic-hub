import { createHash, randomBytes, scryptSync } from "node:crypto";
import type { StoreState, User } from "../domain/models";

const now = "2026-08-19T12:00:00.000Z";

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

export function passwordFingerprint(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function demoUser(
  id: string,
  email: string,
  displayName: string,
  role: User["role"],
  departmentCode: string,
  password: string,
  patientIds: string[] = [],
  serviceCodes: string[] = []
): User {
  return {
    id,
    email,
    displayName,
    role,
    departmentCode,
    passwordHash: hashPassword(password, `fixture-${id}`),
    timezone: "America/Sao_Paulo",
    patientIds,
    serviceCodes,
    active: true,
    createdAt: now,
    version: 1
  };
}

export function createDemoState(password = process.env.DEMO_PASSWORD ?? "local-demo-password"): StoreState {
  return {
    users: [
      demoUser("user-vet", "vet@cvg.local", "Dra. Marina Costa", "VETERINARIAN", "INPATIENT", password, ["patient-thor", "patient-mel"]),
      demoUser("user-lab", "lab@cvg.local", "Técnica Joana Lima", "LAB_TECH", "LABORATORY", password, [], ["HEMOGRAM", "CRP"]),
      demoUser("user-rx", "rx@cvg.local", "Equipe Radiologia", "RADIOLOGY_TEAM", "RADIOLOGY", password, [], ["XRAY_THORAX"]),
      demoUser("user-us", "us@cvg.local", "Equipe Ultrassom", "ULTRASOUND_TEAM", "ULTRASOUND", password, [], ["ULTRASOUND_ABDOMEN"]),
      demoUser("user-manager", "manager@cvg.local", "Gestão Operacional", "MANAGER", "INPATIENT", password),
      demoUser("user-admin", "admin@cvg.local", "Administração Técnica", "ADMIN", "IT", password)
    ],
    sessions: [],
    patients: [
      { id: "patient-thor", displayName: "Thor", species: "Canino", breed: "Labrador", sex: "Macho", birthDate: "2019-04-12", ownerLabel: "A. Oliveira", externalId: "HIS-THOR-001", active: true },
      { id: "patient-mel", displayName: "Mel", species: "Felino", breed: "SRD", sex: "Fêmea", birthDate: "2021-10-03", ownerLabel: "B. Souza", externalId: "HIS-MEL-001", active: true },
      { id: "patient-mel-2", displayName: "Mel", species: "Canino", breed: "Poodle", sex: "Fêmea", birthDate: "2020-02-17", ownerLabel: "C. Santos", externalId: "HIS-MEL-002", active: true }
    ],
    encounters: [
      { id: "encounter-thor", patientId: "patient-thor", externalId: "ATD-THOR-001", type: "INPATIENT", status: "OPEN", openedAt: now },
      { id: "encounter-mel", patientId: "patient-mel", externalId: "ATD-MEL-001", type: "EMERGENCY", status: "OPEN", openedAt: now }
    ],
    admissions: [
      { id: "admission-thor", encounterId: "encounter-thor", departmentCode: "INPATIENT", ward: "UTI 1", bed: "Box 03", admittedAt: now, version: 1 }
    ],
    services: [
      { id: "service-hemogram", code: "HEMOGRAM", name: "Hemograma", category: "LABORATORY", departmentCode: "LABORATORY", workflowType: "LABORATORY", requiresSample: true, requiresSchedule: false, allowsAttachment: false, active: true, resultSchema: "NUMERIC_PANEL", slaHours: { ROUTINE: 8, URGENT: 4, EMERGENCY: 2 }, version: 1 },
      { id: "service-crp", code: "CRP", name: "Proteína C reativa", category: "LABORATORY", departmentCode: "LABORATORY", workflowType: "LABORATORY", requiresSample: true, requiresSchedule: false, allowsAttachment: false, active: true, resultSchema: "NUMERIC_PANEL", slaHours: { ROUTINE: 8, URGENT: 4, EMERGENCY: 2 }, version: 1 },
      { id: "service-xray", code: "XRAY_THORAX", name: "RX de tórax", category: "IMAGING", departmentCode: "RADIOLOGY", workflowType: "RADIOLOGY", requiresSample: false, requiresSchedule: false, allowsAttachment: true, active: true, resultSchema: "NARRATIVE", slaHours: { ROUTINE: 24, URGENT: 8, EMERGENCY: 4 }, version: 1 },
      { id: "service-ultrasound", code: "ULTRASOUND_ABDOMEN", name: "Ultrassom abdominal", category: "IMAGING", departmentCode: "ULTRASOUND", workflowType: "ULTRASOUND", requiresSample: false, requiresSchedule: true, allowsAttachment: true, active: true, resultSchema: "NARRATIVE", slaHours: { ROUTINE: 48, URGENT: 12, EMERGENCY: 6 }, version: 1 }
    ],
    reasonCodes: [
      { id: "reason-hemolyzed", type: "RECOLLECTION", code: "HEMOLYZED", label: "Amostra hemolisada", active: true, version: 1 },
      { id: "reason-insufficient", type: "RECOLLECTION", code: "INSUFFICIENT_VOLUME", label: "Volume insuficiente", active: true, version: 1 },
      { id: "reason-cancel", type: "CANCEL", code: "CLINICAL_DECISION", label: "Decisão clínica", active: true, version: 1 },
      { id: "reason-reject", type: "REJECT", code: "UNPROCESSABLE", label: "Item não processável", active: true, version: 1 },
      { id: "reason-amend", type: "AMEND", code: "CORRECTION", label: "Correção de laudo", active: true, version: 1 }
    ],
    requests: [],
    items: [],
    samples: [],
    procedures: [],
    schedules: [],
    results: [],
    resultVersions: [],
    notifications: [],
    auditEvents: [],
    outbox: [],
    idempotency: [],
    attachments: [],
    protocolSequence: 1
  };
}
