/**
 * 全局查货搜索条件单元测试(TC-INV-004):
 * buildSerialSearchWhere 是纯函数,验证一个关键字能同时覆盖
 * IMEI 主/副、序列号、SKU 编码/名称、单条码/多条码、品牌与型号。
 */
import { describe, expect, it } from "vitest";
import type { Prisma } from "@jincheng/database";
import {
  buildSerialSearchWhere,
  classifySkuGroupKind,
  hasCompactTokenMatch,
  parseSkuColor,
  parseSkuSpec,
} from "./inventory.service.js";

/** 递归收集 where 条件里出现的全部叶子字段路径(a.b.c 形式) */
function collectPaths(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) return [];
  const record = node as Record<string, unknown>;
  // contains 叶子:记录当前路径
  if ("contains" in record) return [prefix];
  const paths: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      for (const item of value) paths.push(...collectPaths(item, prefix));
    } else {
      const next = prefix ? `${prefix}.${key}` : key;
      paths.push(...collectPaths(value, next));
    }
  }
  return paths;
}

describe("buildSerialSearchWhere", () => {
  it("一个关键字覆盖 IMEI/SN/SKU/条码/品牌/型号全部匹配维度", () => {
    const where = buildSerialSearchWhere("iPhone");
    const paths = collectPaths(where);
    expect(paths).toEqual(
      expect.arrayContaining([
        "imeiPrimary",
        "imeiSecondary",
        "serialNumber",
        "sku.code",
        "sku.name",
        "sku.barcode",
        "sku.barcodes.some.value",
        "sku.product.brand",
        "sku.product.modelName",
      ]),
    );
  });

  it("匹配统一为大小写不敏感的 contains 查询", () => {
    const where = buildSerialSearchWhere("864") as {
      OR: Prisma.SerialItemWhereInput[];
    };
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR.length).toBeGreaterThanOrEqual(9);
    // 抽查首个条件的形态
    expect(where.OR[0]).toEqual({
      imeiPrimary: { contains: "864", mode: "insensitive" },
    });
  });

  it("关键字先去除首尾空白再参与匹配", () => {
    const where = buildSerialSearchWhere("  A3096  ") as {
      OR: Array<{ imeiPrimary?: { contains: string } }>;
    };
    expect(where.OR[0]?.imeiPrimary?.contains).toBe("A3096");
  });
});

describe("classifySkuGroupKind 商品分组归类(TC-INV-007)", () => {
  it("真机/主商品 → primary", () => {
    expect(classifySkuGroupKind("Mate 80 Pro Max 16GB+512GB 极夜黑")).toBe(
      "primary",
    );
    expect(classifySkuGroupKind("HUAWEI Pocket 2 12+512 雅黑")).toBe("primary");
  });

  it("名称以「演」开头 → demo 演示机", () => {
    expect(classifySkuGroupKind("演mate80 Pro Max 16+512极昼金")).toBe("demo");
    expect(classifySkuGroupKind("演HUAWEI Mate80/ 80pro 微泵液冷壳 黑色")).toBe(
      "demo",
    );
  });

  it("配件关键词(保护壳/贴膜/充电器等) → accessory", () => {
    expect(classifySkuGroupKind("HUAWEI Mate80 pro MAX 素皮保护壳 青色")).toBe(
      "accessory",
    );
    expect(classifySkuGroupKind("Mate80 钢化膜 高清")).toBe("accessory");
    expect(classifySkuGroupKind("66W 超级快充充电器")).toBe("accessory");
  });
});

describe("parseSkuColor/parseSkuSpec 商品属性解析(TC-INV-008)", () => {
  it("手机:容量对 + 结尾颜色", () => {
    expect(parseSkuColor("Mate 80 Pro Max 16GB+512GB 极夜黑")).toBe("极夜黑");
    expect(parseSkuSpec("Mate 80 Pro Max 16GB+512GB 极夜黑")).toBe("16+512");
    expect(parseSkuSpec("Mate X7 典藏版 16+1TB云锦白")).toBe("16+1T");
  });

  it("电脑:CPU + 容量对", () => {
    expect(
      parseSkuSpec("演HUAWEI matebook 13S EMD-W56 i5 11300H 16+512云杉绿"),
    ).toBe("i5 16+512");
    expect(
      parseSkuColor("演HUAWEI matebook 16S CREF-16 i7 12700H 16+512深空灰"),
    ).toBe("深空灰");
  });

  it("手表:表盘尺寸 + 表带颜色", () => {
    expect(parseSkuSpec("演HUAWEI WATCH 5 42mm 黑色素皮复合表带")).toBe("42mm");
    expect(parseSkuColor("演HUAWEI WATCH 5 42mm 黑色素皮复合表带")).toBe("黑");
    expect(parseSkuColor("华为 WATCH FIT 3 原野绿氟橡胶表带")).toBe("原野绿");
  });

  it("显示器:屏幕寸(无容量对时)", () => {
    expect(parseSkuSpec("华为MateView 28.2寸 4K显示器 皓月银")).toBe("28.2寸");
    expect(parseSkuColor("华为MateView 28.2寸 4K显示器 皓月银")).toBe("皓月银");
  });

  it("耳机/配件:仅颜色,无规格", () => {
    expect(parseSkuColor("FreeBuds 6i 星际黑")).toBe("星际黑");
    expect(parseSkuSpec("FreeBuds 6i 星际黑")).toBeNull();
  });

  it("无颜色词的商品返回 null", () => {
    expect(parseSkuColor("66W 超级快充充电器")).toBeNull();
  });
});

describe("hasCompactTokenMatch 连写词边界(TC-INV-009)", () => {
  const proMax = "mate80promax16gb+512gb极夜黑";
  const pro = "mate80pro12gb+512gb云杉绿";
  const proPlus = "mate70pro+12+512曜石黑";

  it("mate80pro 命中 Pro,不命中 Pro Max(后随字母)", () => {
    expect(hasCompactTokenMatch(pro, "mate80pro")).toBe(true);
    expect(hasCompactTokenMatch(proMax, "mate80pro")).toBe(false);
  });

  it("mate80promax 只命中 Pro Max", () => {
    expect(hasCompactTokenMatch(proMax, "mate80promax")).toBe(true);
    expect(hasCompactTokenMatch(pro, "mate80promax")).toBe(false);
  });

  it("mate70pro 不命中 Pro+(+ 是另一型号),mate70pro+ 才命中", () => {
    expect(hasCompactTokenMatch(proPlus, "mate70pro")).toBe(false);
    expect(hasCompactTokenMatch(proPlus, "mate70pro+")).toBe(true);
  });

  it("mate80 只命中标准版(pro 系后随字母被排除)", () => {
    expect(hasCompactTokenMatch("mate8012gb+512gb雪域白", "mate80")).toBe(true);
    expect(hasCompactTokenMatch(pro, "mate80")).toBe(false);
    expect(hasCompactTokenMatch(proMax, "mate80")).toBe(false);
  });

  it("关键词后随中文/结尾视为边界", () => {
    expect(hasCompactTokenMatch("mate80pro晨曦金", "mate80pro")).toBe(true);
    expect(hasCompactTokenMatch("watchgt5", "watchgt5")).toBe(true);
  });
});
