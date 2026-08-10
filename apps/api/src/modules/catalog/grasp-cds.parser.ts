export const MAX_GRASP_CDS_BYTES = 50 * 1024 * 1024;

export type CatalogImportErrorCode =
  | "MISSING_SKU_CODE"
  | "MISSING_NAME"
  | "MISSING_WAREHOUSE"
  | "MISSING_SERIAL"
  | "DUPLICATE_SERIAL_IN_SOURCE"
  | "SKU_NAME_CONFLICT";

export interface ParsedGraspCatalogRow {
  rowNumber: number;
  sourceWarehouseCode?: string;
  sourceWarehouseName: string;
  sourceSkuCode: string;
  sourceName: string;
  sourceSerial?: string;
  quantity: 1;
  errorCodes: CatalogImportErrorCode[];
}

export interface ParsedGraspCatalog {
  rows: ParsedGraspCatalogRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  uniqueSkus: number;
  warehouseCount: number;
  duplicateSerials: number;
  conflictingSkuNames: number;
}

export class GraspCdsParseError extends Error {}

function recordStarts(bytes: Uint8Array): number[] {
  const starts: number[] = [];
  for (let index = 0; index + 4 <= bytes.length; index += 1) {
    if (
      bytes[index] !== 0x04 ||
      bytes[index + 1] !== 0x00 ||
      bytes[index + 3] !== 0x2a
    ) {
      continue;
    }
    if (bytes[index + 2] !== 0x00 && bytes[index + 2] !== 0x20) continue;
    const fieldStart = index + 4;
    if (fieldStart + 4 > bytes.length) continue;
    const firstLength = bytes[fieldStart]! | (bytes[fieldStart + 1]! << 8);
    if (firstLength < 1 || firstLength > 8) continue;
    starts.push(fieldStart);
  }
  return starts;
}

function readFields(
  bytes: Uint8Array,
  start: number,
  decoder: TextDecoder,
): string[] {
  const fields: string[] = [];
  let position = start;
  while (position + 2 <= bytes.length && fields.length < 8) {
    const length = bytes[position]! | (bytes[position + 1]! << 8);
    position += 2;
    if (length > 300 || position + length > bytes.length) break;
    fields.push(
      decoder.decode(bytes.slice(position, position + length)).trim(),
    );
    position += length;
  }
  return fields;
}

export function parseGraspCatalogCds(content: Uint8Array): ParsedGraspCatalog {
  if (content.byteLength === 0)
    throw new GraspCdsParseError("管家婆 CDS 文件为空");
  if (content.byteLength > MAX_GRASP_CDS_BYTES) {
    throw new GraspCdsParseError("管家婆 CDS 文件超过 50MB 安全上限");
  }

  const decoder = new TextDecoder("gb18030");
  const rows: ParsedGraspCatalogRow[] = [];
  for (const start of recordStarts(content)) {
    const fields = readFields(content, start, decoder);
    if (fields.length < 6 || !/^\d+$/.test(fields[0] ?? "")) continue;
    rows.push({
      rowNumber: Number(fields[0]),
      sourceWarehouseCode: fields[1] || undefined,
      sourceWarehouseName: fields[2] ?? "",
      sourceSkuCode: fields[3] ?? "",
      sourceName: fields[4] ?? "",
      sourceSerial: fields[5] || undefined,
      quantity: 1,
      errorCodes: [],
    });
  }
  if (rows.length === 0) {
    throw new GraspCdsParseError("管家婆 CDS 中没有识别到序列号库存记录");
  }

  const serialCounts = new Map<string, number>();
  const namesBySku = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.sourceSerial) {
      serialCounts.set(
        row.sourceSerial,
        (serialCounts.get(row.sourceSerial) ?? 0) + 1,
      );
    }
    if (row.sourceSkuCode && row.sourceName) {
      const names = namesBySku.get(row.sourceSkuCode) ?? new Set<string>();
      names.add(row.sourceName);
      namesBySku.set(row.sourceSkuCode, names);
    }
  }

  for (const row of rows) {
    if (!row.sourceSkuCode) row.errorCodes.push("MISSING_SKU_CODE");
    if (!row.sourceName) row.errorCodes.push("MISSING_NAME");
    if (!row.sourceWarehouseName) row.errorCodes.push("MISSING_WAREHOUSE");
    if (!row.sourceSerial) row.errorCodes.push("MISSING_SERIAL");
    if (row.sourceSerial && (serialCounts.get(row.sourceSerial) ?? 0) > 1) {
      row.errorCodes.push("DUPLICATE_SERIAL_IN_SOURCE");
    }
    if ((namesBySku.get(row.sourceSkuCode)?.size ?? 0) > 1) {
      row.errorCodes.push("SKU_NAME_CONFLICT");
    }
  }

  const duplicateSerials = [...serialCounts.values()].filter(
    (count) => count > 1,
  ).length;
  const conflictingSkuNames = [...namesBySku.values()].filter(
    (names) => names.size > 1,
  ).length;
  const validRows = rows.filter((row) => row.errorCodes.length === 0).length;
  return {
    rows,
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
    uniqueSkus: new Set(rows.map((row) => row.sourceSkuCode).filter(Boolean))
      .size,
    warehouseCount: new Set(
      rows.map((row) => row.sourceWarehouseName).filter(Boolean),
    ).size,
    duplicateSerials,
    conflictingSkuNames,
  };
}
