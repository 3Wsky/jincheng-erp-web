/**
 * 销售账号门店+仓库划分规则(TC-ORG-004)
 */
import { describe, expect, it } from "vitest";
import {
  dataScopeForRole,
  missingSalesAssignmentMessage,
  requiresSalesAssignment,
  suggestPersonalWarehouseId,
} from "./sales-assignment.js";

describe("requiresSalesAssignment", () => {
  it("内置销售角色必须划分门店和仓库", () => {
    expect(
      requiresSalesAssignment([{ code: "SALES", permissions: ["sales:write"] }]),
    ).toBe(true);
  });

  it("管理员即使有 sales:write 也不按销售岗强制划分", () => {
    expect(
      requiresSalesAssignment([
        { code: "ADMIN", permissions: ["sales:write", "role:write"] },
      ]),
    ).toBe(false);
  });

  it("自定义角色带销售写入权需要划分地点", () => {
    expect(
      requiresSalesAssignment([
        { code: "SHOP_SALES", permissions: ["sales:write", "catalog:read"] },
      ]),
    ).toBe(true);
  });

  it("库管人事等内置岗不强制", () => {
    expect(
      requiresSalesAssignment([{ code: "WAREHOUSE_KEEPER", permissions: [] }]),
    ).toBe(false);
  });
});

describe("dataScopeForRole", () => {
  it("管理员/老板写入组织范围", () => {
    expect(dataScopeForRole("ADMIN")).toBe("ORGANIZATION");
    expect(dataScopeForRole("BOSS")).toBe("ORGANIZATION");
  });

  it("销售写入门店范围", () => {
    expect(dataScopeForRole("SALES")).toBe("STORE");
  });

  it("其他角色保持个人范围", () => {
    expect(dataScopeForRole("HR")).toBe("PERSONAL");
  });
});

describe("missingSalesAssignmentMessage", () => {
  it("缺门店时提示先划分门店", () => {
    expect(
      missingSalesAssignmentMessage({ storeId: null, warehouseIds: ["w1"] }),
    ).toContain("门店");
  });

  it("缺仓库时提示再划分仓库", () => {
    expect(
      missingSalesAssignmentMessage({ storeId: "s1", warehouseIds: [] }),
    ).toContain("仓库");
  });

  it("门店和仓库都有则通过", () => {
    expect(
      missingSalesAssignmentMessage({ storeId: "s1", warehouseIds: ["w1"] }),
    ).toBeNull();
  });
});

describe("suggestPersonalWarehouseId", () => {
  const warehouses = [
    {
      id: "w-yang",
      name: "杨菲",
      type: "PERSONAL",
      ownerEmployeeId: null,
    },
    {
      id: "w-store",
      name: "锦程一店",
      type: "STORE",
      ownerEmployeeId: null,
    },
  ];

  it("姓名与个人仓全名一致时预勾该仓", () => {
    expect(suggestPersonalWarehouseId("杨菲", warehouses)).toBe("w-yang");
  });

  it("已挂到该员工的个人仓优先于同名匹配", () => {
    expect(
      suggestPersonalWarehouseId("杨菲", [
        ...warehouses,
        {
          id: "w-owned",
          name: "杨菲2",
          type: "PERSONAL",
          ownerEmployeeId: "emp-1",
        },
      ], "emp-1"),
    ).toBe("w-owned");
  });

  it("门店仓不参与姓名匹配", () => {
    expect(suggestPersonalWarehouseId("锦程一店", warehouses)).toBeNull();
  });
});
