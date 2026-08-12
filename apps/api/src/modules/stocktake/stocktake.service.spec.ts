/**
 * 盘点差异计算纯函数单元测试(TC-STK-002):
 * 盘亏(账面有实盘无)/盘盈(系统外)/串仓(在他仓)三类差异判定。
 */
import { describe, expect, it } from "vitest";
import {
  computeStocktakeDifferences,
  generateStocktakeCode,
} from "./stocktake.service.js";

const WAREHOUSE = "11111111-1111-1111-1111-111111111111";
const OTHER_WAREHOUSE = "22222222-2222-2222-2222-222222222222";

describe("computeStocktakeDifferences 差异判定", () => {
  it("账面与实盘完全一致 → 无差异", () => {
    const differences = computeStocktakeDifferences({
      warehouseId: WAREHOUSE,
      bookSerials: [
        { id: "s1", imeiPrimary: "860000000000001" },
        { id: "s2", imeiPrimary: "860000000000002" },
      ],
      scans: [
        {
          imei: "860000000000001",
          serialId: "s1",
          serialCurrentWarehouseId: WAREHOUSE,
          serialWarehouseName: "总库",
        },
        {
          imei: "860000000000002",
          serialId: "s2",
          serialCurrentWarehouseId: WAREHOUSE,
          serialWarehouseName: "总库",
        },
      ],
    });
    expect(differences).toEqual([]);
  });

  it("账面在库但未扫到 → MISSING 盘亏", () => {
    const differences = computeStocktakeDifferences({
      warehouseId: WAREHOUSE,
      bookSerials: [
        { id: "s1", imeiPrimary: "860000000000001" },
        { id: "s2", imeiPrimary: "860000000000002" },
      ],
      scans: [
        {
          imei: "860000000000001",
          serialId: "s1",
          serialCurrentWarehouseId: WAREHOUSE,
          serialWarehouseName: "总库",
        },
      ],
    });
    expect(differences).toHaveLength(1);
    expect(differences[0]).toMatchObject({
      type: "MISSING",
      serialId: "s2",
      imei: "860000000000002",
    });
  });

  it("扫到系统外设备(无档案) → UNEXPECTED 盘盈", () => {
    const differences = computeStocktakeDifferences({
      warehouseId: WAREHOUSE,
      bookSerials: [],
      scans: [
        {
          imei: "990000000000009",
          serialId: null,
          serialCurrentWarehouseId: null,
          serialWarehouseName: null,
        },
      ],
    });
    expect(differences).toHaveLength(1);
    expect(differences[0]).toMatchObject({
      type: "UNEXPECTED",
      serialId: null,
      imei: "990000000000009",
    });
    expect(differences[0]!.note).toContain("系统外");
  });

  it("扫到账面在其他仓的设备 → UNEXPECTED 串仓(note 标注实际位置)", () => {
    const differences = computeStocktakeDifferences({
      warehouseId: WAREHOUSE,
      bookSerials: [],
      scans: [
        {
          imei: "860000000000003",
          serialId: "s3",
          serialCurrentWarehouseId: OTHER_WAREHOUSE,
          serialWarehouseName: "中山门店仓",
        },
      ],
    });
    expect(differences).toHaveLength(1);
    expect(differences[0]).toMatchObject({ type: "UNEXPECTED", serialId: "s3" });
    expect(differences[0]!.note).toContain("中山门店仓");
  });

  it("混合场景:盘亏 + 盘盈 + 串仓同时判定", () => {
    const differences = computeStocktakeDifferences({
      warehouseId: WAREHOUSE,
      bookSerials: [
        { id: "s1", imeiPrimary: "860000000000001" },
        { id: "s2", imeiPrimary: "860000000000002" },
      ],
      scans: [
        {
          imei: "860000000000001",
          serialId: "s1",
          serialCurrentWarehouseId: WAREHOUSE,
          serialWarehouseName: "总库",
        },
        {
          imei: "990000000000009",
          serialId: null,
          serialCurrentWarehouseId: null,
          serialWarehouseName: null,
        },
        {
          imei: "860000000000003",
          serialId: "s3",
          serialCurrentWarehouseId: OTHER_WAREHOUSE,
          serialWarehouseName: "中山门店仓",
        },
      ],
    });
    const types = differences.map((difference) => difference.type).sort();
    expect(types).toEqual(["MISSING", "UNEXPECTED", "UNEXPECTED"]);
  });
});

describe("generateStocktakeCode 单号生成", () => {
  it("格式为 STK-YYYYMMDD-4位十六进制", () => {
    const code = generateStocktakeCode(new Date("2026-08-12T13:30:00+08:00"));
    expect(code).toMatch(/^STK-20260812-[0-9A-F]{4}$/);
  });
});
