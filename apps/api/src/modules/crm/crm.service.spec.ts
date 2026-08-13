/**
 * 手机号脱敏与规范化纯函数测试(TC-CRM-002):
 * docs/11:完整手机号默认中间位脱敏;所有角色一律脱敏(明文权限待 Field 维度签字)。
 */
import { describe, expect, it } from "vitest";
import { maskPhone, normalizePhone } from "./crm.service.js";

describe("maskPhone 手机号脱敏", () => {
  it("11 位手机号保留前 3 后 4", () => {
    expect(maskPhone("13812345678")).toBe("138****5678");
  });

  it("超长号码(含国家码)中间全掩码", () => {
    expect(maskPhone("8613812345678")).toBe("861******5678");
  });

  it("7~10 位号码保留前 2 后 2", () => {
    expect(maskPhone("07601234")).toBe("07****34");
    expect(maskPhone("1234567")).toBe("12***67");
  });

  it("过短号码全掩码", () => {
    expect(maskPhone("12345")).toBe("*****");
  });

  it("空值返回 null", () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone(undefined)).toBeNull();
    expect(maskPhone("")).toBeNull();
  });
});

describe("normalizePhone 手机号规范化", () => {
  it("去除空格与连字符", () => {
    expect(normalizePhone("138 1234-5678")).toBe("13812345678");
  });

  it("普通号码原样保留", () => {
    expect(normalizePhone("13812345678")).toBe("13812345678");
  });
});
