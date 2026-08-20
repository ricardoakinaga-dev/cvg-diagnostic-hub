import { describe, expect, it } from "vitest";
import { canAccessResource, hasPermission, rolePermissions } from "./authorization";
import { hasPermissionForUser } from "../domain/models";

describe("server authorization", () => {
  it("grants lab operations only to a lab role", () => {
    expect(hasPermission("LAB_TECH", "sample.receive")).toBe(true);
    expect(hasPermission("VETERINARIAN", "sample.receive")).toBe(false);
  });

  it("does not allow a client-supplied department to widen a scope", () => {
    const actor = {
      id: "user-care",
      role: "VETERINARIAN" as const,
      departmentCode: "INPATIENT",
      patientIds: ["patient-1"]
    };

    expect(
      canAccessResource(actor, "request.view", {
        patientId: "patient-2",
        departmentCode: "INPATIENT"
      })
    ).toBe(false);
    expect(rolePermissions.VETERINARIAN).not.toContain("sample.receive");
  });

  it("does not grant attachment bytes to a read-only viewer", () => {
    expect(hasPermission("VIEWER", "attachment.download")).toBe(false);
    expect(hasPermission("VETERINARIAN", "attachment.download")).toBe(true);
  });

  it("uses the role matrix instead of treating every permission as granted", () => {
    const viewer = { role: "VIEWER", active: true } as Parameters<typeof hasPermissionForUser>[0];
    expect(hasPermissionForUser(viewer, "sample.receive")).toBe(false);
    expect(hasPermissionForUser(viewer, "request.view")).toBe(true);
    expect(hasPermissionForUser({ ...viewer, active: false }, "request.view")).toBe(false);
  });
});
