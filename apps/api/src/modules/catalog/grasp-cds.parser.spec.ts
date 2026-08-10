import { describe, expect, it } from "vitest";
import {
  GraspCdsParseError,
  parseGraspCatalogCds,
} from "./grasp-cds.parser.js";

function record(fields: string[], marker = 0x20): number[] {
  const encoder = new TextEncoder();
  const bytes: number[] = [0x04, 0x00, marker, 0x2a];
  for (const field of fields) {
    const raw = [...encoder.encode(field)];
    bytes.push(raw.length & 0xff, raw.length >> 8, ...raw);
  }
  return bytes;
}

describe("管家婆 CDS 货品解析", () => {
  it("解析编码、名称、仓库和序列号", () => {
    const content = new Uint8Array([
      ...record(["1", "01", "仓A", "SKU-1", "Phone A", "SN001"]),
      ...record(["2", "02", "仓B", "SKU-1", "Phone A", "SN002"], 0x00),
    ]);

    const result = parseGraspCatalogCds(content);

    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(2);
    expect(result.uniqueSkus).toBe(1);
    expect(result.warehouseCount).toBe(2);
    expect(result.rows[0]).toMatchObject({
      sourceSkuCode: "SKU-1",
      sourceSerial: "SN001",
    });
  });

  it("重复串号与同编码多名称进入错误清单", () => {
    const content = new Uint8Array([
      ...record(["1", "01", "仓A", "SKU-1", "Phone A", "SN001"]),
      ...record(["2", "01", "仓A", "SKU-1", "Phone B", "SN001"]),
    ]);

    const result = parseGraspCatalogCds(content);

    expect(result.invalidRows).toBe(2);
    expect(result.duplicateSerials).toBe(1);
    expect(result.conflictingSkuNames).toBe(1);
    expect(result.rows[0]?.errorCodes).toEqual(
      expect.arrayContaining([
        "DUPLICATE_SERIAL_IN_SOURCE",
        "SKU_NAME_CONFLICT",
      ]),
    );
  });

  it("空文件给出业务层错误", () => {
    expect(() => parseGraspCatalogCds(new Uint8Array())).toThrow(
      GraspCdsParseError,
    );
  });
});
