import { describe, expect, it } from "vitest";
import { hashPassword, signJwt, verifyJwt, verifyPassword } from "@jincheng/database";

describe("security utils", () => {
  it("hashes and verifies a password", async () => {
    const stored = await hashPassword("Admin@123456");
    expect(stored.startsWith("v1:scrypt:")).toBe(true);
    expect(await verifyPassword("Admin@123456", stored)).toBe(true);
    expect(await verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("returns false for missing hash and never throws", async () => {
    expect(await verifyPassword("any-password", null)).toBe(false);
    expect(await verifyPassword("any-password", undefined)).toBe(false);
  });

  it("signs and verifies a JWT with expiry", () => {
    const secret = "test-secret-at-least-32-characters-long";
    const token = signJwt(
      {
        sub: "user-id",
        username: "admin",
        employeeId: "employee-id",
        organizationId: "org-id",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      secret,
    );
    const payload = verifyJwt(token, secret);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("user-id");
    expect(payload?.username).toBe("admin");
  });

  it("rejects tampered tokens", () => {
    const secret = "test-secret-at-least-32-characters-long";
    const token = signJwt(
      {
        sub: "user-id",
        username: "admin",
        employeeId: "employee-id",
        organizationId: "org-id",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      secret,
    );
    const tampered = `${token.slice(0, -2)}xx`;
    expect(verifyJwt(tampered, secret)).toBeNull();
    expect(verifyJwt(token, "wrong-secret-value")).toBeNull();
  });

  it("rejects expired tokens", () => {
    const secret = "test-secret-at-least-32-characters-long";
    const token = signJwt(
      {
        sub: "user-id",
        username: "admin",
        employeeId: "employee-id",
        organizationId: "org-id",
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      secret,
    );
    expect(verifyJwt(token, secret)).toBeNull();
  });
});
