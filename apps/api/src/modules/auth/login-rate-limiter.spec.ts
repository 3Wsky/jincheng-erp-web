import { describe, expect, it } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { LoginRateLimiter } from "./auth.service.js";

describe("LoginRateLimiter", () => {
  it("allows attempts below the threshold", () => {
    const limiter = new LoginRateLimiter(3, 60_000);
    expect(() => limiter.check("1.2.3.4", "admin")).not.toThrow();
    limiter.recordFailure("1.2.3.4", "admin");
    limiter.recordFailure("1.2.3.4", "admin");
    expect(() => limiter.check("1.2.3.4", "admin")).not.toThrow();
  });

  it("blocks after exceeding the threshold", () => {
    const limiter = new LoginRateLimiter(3, 60_000);
    limiter.recordFailure("1.2.3.4", "admin");
    limiter.recordFailure("1.2.3.4", "admin");
    limiter.recordFailure("1.2.3.4", "admin");
    expect(() => limiter.check("1.2.3.4", "admin")).toThrow(
      ForbiddenException,
    );
  });

  it("treats usernames case-insensitively per ip", () => {
    const limiter = new LoginRateLimiter(2, 60_000);
    limiter.recordFailure("1.2.3.4", "Admin");
    limiter.recordFailure("1.2.3.4", "admin");
    expect(() => limiter.check("1.2.3.4", "ADMIN")).toThrow(ForbiddenException);
  });

  it("does not mix limits between ips", () => {
    const limiter = new LoginRateLimiter(1, 60_000);
    limiter.recordFailure("1.2.3.4", "admin");
    expect(() => limiter.check("5.6.7.8", "admin")).not.toThrow();
  });

  it("resets after a successful login", () => {
    const limiter = new LoginRateLimiter(1, 60_000);
    limiter.recordFailure("1.2.3.4", "admin");
    expect(() => limiter.check("1.2.3.4", "admin")).toThrow(ForbiddenException);
    limiter.reset("1.2.3.4", "admin");
    expect(() => limiter.check("1.2.3.4", "admin")).not.toThrow();
  });
});
