import { describe, expect, it } from "vitest";
import { createApplicationService } from "./service";
import { createDemoState } from "../store/fixtures";
import { MemoryStore } from "../store/memory-store";
import { loginUser } from "../security/session";

function setup() {
  const store = new MemoryStore(createDemoState("management-test-password"));
  const service = createApplicationService(store);
  const user = (email: string) => {
    const actor = store.getState().users.find((entry) => entry.email === email);
    if (!actor) throw new Error(`missing fixture actor: ${email}`);
    return actor;
  };
  return { store, service, admin: user("admin@cvg.local"), manager: user("manager@cvg.local"), vet: user("vet@cvg.local") };
}

describe("management control center", () => {
  it("lets a delegated manager create and deactivate an operational collaborator", async () => {
    const { store, service, manager } = setup();
    const reauthenticatedManager = { ...manager, reauthenticatedAt: new Date().toISOString() };
    const created = await service.createManagedUser(reauthenticatedManager, {
      email: "new.lab.tech@cvg.local",
      displayName: "Nova técnica de laboratório",
      password: "secure-lab-password-123",
      role: "LAB_TECH",
      departmentCode: "LABORATORY",
      timezone: "America/Sao_Paulo",
      reason: "Admissão operacional para cobertura do laboratório",
      confirm: true,
      idempotencyKey: "management-create-user"
    });

    expect(created).toMatchObject({ email: "new.lab.tech@cvg.local", role: "LAB_TECH", active: true, version: 1 });
    expect(created).not.toHaveProperty("passwordHash");
    expect(store.getState().users.find((user) => user.id === created.id)?.passwordHash).not.toBe("secure-lab-password-123");

    const login = await loginUser(store, "new.lab.tech@cvg.local", "secure-lab-password-123");
    const deactivated = await service.deactivateManagedUser(reauthenticatedManager, created.id, {
      expectedVersion: created.version,
      reason: "Encerramento do acesso operacional",
      confirm: true,
      idempotencyKey: "management-deactivate-user"
    });

    expect(deactivated).toMatchObject({ id: created.id, active: false, version: 2 });
    expect(store.getState().sessions.find((session) => session.tokenHash === store.getState().sessions.find((entry) => entry.userId === created.id)?.tokenHash)?.revokedAt).toBeTruthy();
    await expect(loginUser(store, "new.lab.tech@cvg.local", "secure-lab-password-123")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(store.getState().auditEvents.map((event) => event.eventType)).toEqual(expect.arrayContaining(["UserCreated", "UserDeactivated"]));
  });

  it("keeps delegated managers away from technical roles and outside departments", async () => {
    const { service, manager, admin } = setup();
    const reauthenticatedManager = { ...manager, reauthenticatedAt: new Date().toISOString() };

    await expect(service.createManagedUser(reauthenticatedManager, {
      email: "forbidden.admin@cvg.local",
      displayName: "Tentativa técnica",
      password: "secure-admin-password-123",
      role: "ADMIN",
      departmentCode: "IT",
      timezone: "America/Sao_Paulo",
      reason: "Tentativa indevida",
      confirm: true,
      idempotencyKey: "management-forbidden-admin"
    })).rejects.toMatchObject({ code: "SCOPE_DENIED" });

    await expect(service.updateUserRole(reauthenticatedManager, admin.id, {
      role: "VIEWER",
      departmentCode: "IT",
      active: true,
      expectedVersion: admin.version,
      reason: "Tentativa indevida",
      confirm: true,
      idempotencyKey: "management-forbidden-admin-update"
    })).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  });

  it("lets an administrator configure and revise a manager's delegated departments", async () => {
    const { service, admin } = setup();
    const reauthenticatedAdmin = { ...admin, reauthenticatedAt: new Date().toISOString() };
    const created = await service.createManagedUser(reauthenticatedAdmin, {
      email: "delegated.manager@cvg.local",
      displayName: "Gestora delegada",
      password: "secure-manager-password-123",
      role: "MANAGER",
      departmentCode: "OPERATIONS",
      managedDepartmentCodes: ["laboratory", "RADIOLOGY", "laboratory"],
      timezone: "America/Sao_Paulo",
      reason: "Delegação da operação diagnóstica",
      confirm: true,
      idempotencyKey: "management-create-delegated-manager"
    });

    expect(created).toMatchObject({ role: "MANAGER", departmentCode: "OPERATIONS", managedDepartmentCodes: ["LABORATORY", "RADIOLOGY"] });

    const updated = await service.updateUserRole(reauthenticatedAdmin, created.id, {
      role: "MANAGER",
      departmentCode: "OPERATIONS",
      managedDepartmentCodes: ["ULTRASOUND"],
      active: true,
      expectedVersion: created.version,
      reason: "Revisão do escopo delegado",
      confirm: true,
      idempotencyKey: "management-update-delegated-manager"
    });

    expect(updated).toMatchObject({ id: created.id, managedDepartmentCodes: ["ULTRASOUND"], version: 2 });
  });

  it("returns one scoped operational snapshot with departments and pending work", async () => {
    const { service, manager, vet } = setup();
    const request = await service.createRequest(vet, {
      patientId: "patient-thor",
      encounterId: "encounter-thor",
      priority: "EMERGENCY",
      items: [{ serviceId: "service-hemogram" }, { serviceId: "service-xray" }]
    }, { idempotencyKey: "management-overview-request" });

    const overview = await service.managementOverview(manager);

    expect(overview.asOf).toEqual(expect.any(String));
    expect(overview.summary.activeItems).toBe(2);
    expect(overview.summary.pendingRequests).toBe(1);
    expect(overview.departments.map((department) => department.departmentCode)).toEqual(expect.arrayContaining(["LABORATORY", "RADIOLOGY", "ULTRASOUND"]));
    expect(overview.pending.map((item) => item.requestId)).toEqual(expect.arrayContaining([request.id]));
    expect(overview.pending[0]).toMatchObject({ nextAction: expect.any(String), deepLink: expect.stringContaining(`/requests/${request.id}`) });
  });
});
