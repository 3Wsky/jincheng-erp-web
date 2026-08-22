/**
 * 仓库创建/修改类型约束(TC-ORG-006)
 */
import { describe, expect, it } from "vitest";
import {
  personalOwnerConflictMessage,
  warehouseCreateViolation,
  warehouseUpdateViolation,
} from "./warehouse-rules.js";

describe("warehouseCreateViolation", () => {
  it("门店仓必须关联门店", () => {
    expect(warehouseCreateViolation({ type: "STORE" })).toContain("门店");
    expect(
      warehouseCreateViolation({ type: "STORE", storeId: "store-1" }),
    ).toBeNull();
  });

  it("门店仓不能设置归属员工", () => {
    expect(
      warehouseCreateViolation({
        type: "STORE",
        storeId: "store-1",
        ownerEmployeeId: "emp-1",
      }),
    ).toContain("员工");
  });

  it("个人仓必须指定归属员工,且不在创建时关联门店", () => {
    expect(warehouseCreateViolation({ type: "PERSONAL" })).toContain("员工");
    expect(
      warehouseCreateViolation({ type: "PERSONAL", ownerEmployeeId: "emp-1" }),
    ).toBeNull();
    expect(
      warehouseCreateViolation({
        type: "PERSONAL",
        ownerEmployeeId: "emp-1",
        storeId: "store-1",
      }),
    ).toContain("门店");
  });

  it.each(["COMPANY", "AFTER_SALES", "ABNORMAL"] as const)(
    "%s 不能关联门店或归属员工",
    (type) => {
      expect(warehouseCreateViolation({ type })).toBeNull();
      expect(warehouseCreateViolation({ type, storeId: "store-1" })).toContain(
        "门店",
      );
      expect(
        warehouseCreateViolation({ type, ownerEmployeeId: "emp-1" }),
      ).toContain("员工");
    },
  );
});

describe("personalOwnerConflictMessage", () => {
  const existing = [
    { name: "杨菲", ownerEmployeeId: "emp-yang" },
    { name: "闲置个人仓", ownerEmployeeId: null },
  ];

  it("员工已有个人仓时点名冲突仓", () => {
    expect(personalOwnerConflictMessage("emp-yang", existing)).toContain(
      "杨菲",
    );
  });

  it("员工没有个人仓时通过", () => {
    expect(personalOwnerConflictMessage("emp-new", existing)).toBeNull();
  });

  it("未挂员工的个人仓不算占用", () => {
    expect(
      personalOwnerConflictMessage("emp-new", [
        { name: "闲置个人仓", ownerEmployeeId: null },
      ]),
    ).toBeNull();
  });
});

describe("warehouseUpdateViolation", () => {
  it("门店仓可以调整关联门店", () => {
    expect(
      warehouseUpdateViolation({ type: "STORE", changingStoreId: true }),
    ).toBeNull();
  });

  it.each(["PERSONAL", "COMPANY", "AFTER_SALES", "ABNORMAL"] as const)(
    "%s 不允许调整关联门店",
    (type) => {
      expect(warehouseUpdateViolation({ type, changingStoreId: true })).toContain(
        "门店仓",
      );
    },
  );

  it("只改名时任何类型都通过", () => {
    expect(
      warehouseUpdateViolation({ type: "PERSONAL", changingStoreId: false }),
    ).toBeNull();
  });
});
