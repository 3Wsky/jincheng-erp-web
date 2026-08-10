import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller.js";

describe("HealthController", () => {
  it("reports a healthy API service", () => {
    const result = new HealthController().health();

    expect(result.service).toBe("jincheng-erp-api");
    expect(result.status).toBe("ok");
    expect(Number.isNaN(Date.parse(result.time))).toBe(false);
  });
});

