import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@jincheng/database";
import { readFile } from "node:fs/promises";
import { DatabaseService } from "../../database/database.service.js";

/** 价签数据源单条 SKU 价格 */
interface FeedSkuPrice {
  version?: string;
  price?: string;
  sbomCode?: string;
}

/** 价签数据源单个型号条目(digital-price-tag-generator products.json) */
interface FeedEntry {
  ok?: boolean;
  source?: string;
  fetchedAt?: string;
  product?: {
    title?: string;
    price?: string;
    priceStatus?: string;
    skuPrices?: FeedSkuPrice[];
  };
}

/** 展平后的一条可匹配价格记录 */
export interface FeedPriceRecord {
  feedModel: string;
  title: string;
  version: string;
  price: string;
  sbomCode: string | null;
  fetchedAt: string | null;
  /** 归一化型号键(去品牌前缀、去空格、小写) */
  modelKey: string;
  /** 归一化容量键变体(16GB+512GB → 16gb+512gb 与 16+512) */
  versionKeys: string[];
}

/** 去空格小写 */
export function compactText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

/** 解析"¥ 4,699"/"4699 元"等价格文本为十进制字符串;解析失败返回 null */
export function parsePriceText(value: string | undefined): string | null {
  if (!value) return null;
  const matched = value.replace(/[,，]/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  return matched ? matched[1]! : null;
}

/** 型号键:去掉品牌前缀(华为/HUAWEI/荣耀/HONOR 等)后 compact */
export function buildModelKey(title: string): string {
  const stripped = title
    .replace(/^(华为|HUAWEI|荣耀|HONOR|vivo|iQOO|OPPO|小米|Xiaomi|Redmi|红米|Apple|苹果)\s*/i, "")
    .trim();
  return compactText(stripped);
}

/** 容量键变体:原样 compact + 去掉 GB(16GB+512GB→16+512)、TB→T */
export function buildVersionKeys(version: string): string[] {
  const base = compactText(version);
  const noGb = base.replace(/gb/g, "").replace(/tb/g, "t");
  return base === noGb ? [base] : [base, noGb];
}

/**
 * 把价签项目 products.json 展平为可匹配的价格记录列表。
 * 只保留 ok=true 且能解析出价格的条目;priceStatus 非 available(价格待公布)跳过。
 * 导出为纯函数便于单元测试(TC-CAT-007)。
 */
export function flattenFeed(feed: Record<string, FeedEntry>): FeedPriceRecord[] {
  const records: FeedPriceRecord[] = [];
  for (const [feedModel, entry] of Object.entries(feed)) {
    if (!entry?.ok || !entry.product) continue;
    const { title, priceStatus, skuPrices } = entry.product;
    if (priceStatus && priceStatus !== "available") continue;
    const resolvedTitle = title?.trim() || feedModel;
    const modelKey = buildModelKey(resolvedTitle);
    if (modelKey.length < 2) continue;
    for (const skuPrice of skuPrices ?? []) {
      const price = parsePriceText(skuPrice.price);
      const version = skuPrice.version?.trim();
      if (!price || !version) continue;
      records.push({
        feedModel,
        title: resolvedTitle,
        version,
        price,
        sbomCode: skuPrice.sbomCode ?? null,
        fetchedAt: entry.fetchedAt ?? null,
        modelKey,
        versionKeys: buildVersionKeys(version),
      });
    }
  }
  return records;
}

/**
 * 为一个 SKU 在价格记录中挑选最佳匹配:
 * SKU 名(compact)需同时包含型号键与任一容量键;
 * 多条命中时取型号键最长者(Mate 80 Pro Max 优先于 Mate 80,防止前缀误配)。
 * 导出为纯函数便于单元测试(TC-CAT-007)。
 */
export function matchFeedPrice(
  compactSkuName: string,
  records: FeedPriceRecord[],
): FeedPriceRecord | null {
  let best: FeedPriceRecord | null = null;
  for (const record of records) {
    if (!compactSkuName.includes(record.modelKey)) continue;
    if (!record.versionKeys.some((key) => compactSkuName.includes(key))) {
      continue;
    }
    if (!best || record.modelKey.length > best.modelKey.length) {
      best = record;
    }
  }
  return best;
}

/**
 * 官网价格同步服务:对接 digital-price-tag-generator 产出的 products.json,
 * 按「型号+容量」归一化匹配 ERP SKU 并回填零售价。
 * ERP 不做爬虫——采集职责在价签项目(2026-08-12 架构决定);
 * 原始条目按 AGENTS 第 6 条存 SkuExternalIdentity(sourceSystem=PRICE_TAG_FEED)。
 */
@Injectable()
export class PriceFeedService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async syncFromFeed(requestId: string, actorUserId: string) {
    const feedFile = this.config.get<string>("PRICE_FEED_FILE")?.trim();
    if (!feedFile) {
      throw new ServiceUnavailableException(
        "未配置 PRICE_FEED_FILE(价签项目 products.json 路径),无法同步官网价格",
      );
    }

    let feed: Record<string, FeedEntry>;
    try {
      feed = JSON.parse(await readFile(feedFile, "utf8")) as Record<
        string,
        FeedEntry
      >;
    } catch (error) {
      throw new UnprocessableEntityException(
        `价格数据源读取失败:${error instanceof Error ? error.message : "未知错误"}`,
      );
    }

    const records = flattenFeed(feed);
    if (records.length === 0) {
      throw new UnprocessableEntityException(
        "价格数据源中没有可用的价格记录(可能全部为价格待公布)",
      );
    }

    // 全量 SKU 内存匹配(千级数据量);演示机(名称以「演」开头)不回填官网价
    const skus = await this.database.client.sku.findMany({
      select: { id: true, name: true, retailPrice: true },
    });

    let matched = 0;
    let updated = 0;
    let unchanged = 0;
    let demoSkipped = 0;
    const updates: Array<{
      skuId: string;
      skuName: string;
      before: string | null;
      after: string;
      record: FeedPriceRecord;
    }> = [];

    for (const sku of skus) {
      const record = matchFeedPrice(compactText(sku.name), records);
      if (!record) continue;
      if (sku.name.trim().startsWith("演")) {
        demoSkipped += 1;
        continue;
      }
      matched += 1;
      const before = sku.retailPrice?.toString() ?? null;
      if (before === record.price) {
        unchanged += 1;
        continue;
      }
      updates.push({
        skuId: sku.id,
        skuName: sku.name,
        before,
        after: record.price,
        record,
      });
    }

    // 分批数组事务写入(单次批量提交,避免远程库逐条往返触发交互式事务超时):
    // 价格 + 外部身份(原始载荷,AGENTS 第 6 条)
    const BATCH = 50;
    for (let index = 0; index < updates.length; index += BATCH) {
      const batch = updates.slice(index, index + BATCH);
      const operations = batch.flatMap((update) => {
        const sourceId = `${update.record.modelKey}|${compactText(update.record.version)}`;
        const payload = {
          feedModel: update.record.feedModel,
          title: update.record.title,
          version: update.record.version,
          price: update.record.price,
          sbomCode: update.record.sbomCode,
          fetchedAt: update.record.fetchedAt,
        } as Prisma.InputJsonObject;
        return [
          this.database.client.sku.update({
            where: { id: update.skuId },
            data: { retailPrice: update.after },
          }),
          this.database.client.skuExternalIdentity.upsert({
            where: {
              sourceSystem_sourceId: {
                sourceSystem: "PRICE_TAG_FEED",
                sourceId,
              },
            },
            create: {
              skuId: update.skuId,
              sourceSystem: "PRICE_TAG_FEED",
              sourceId,
              sourcePayload: payload,
            },
            update: { skuId: update.skuId, sourcePayload: payload },
          }),
        ];
      });
      await this.database.client.$transaction(operations, {
        timeout: 60_000,
      });
      updated += batch.length;
    }

    await this.database.client.auditLog.create({
      data: {
        actorUserId,
        action: "catalog.price.sync",
        resource: "Sku",
        resourceId: "PRICE_TAG_FEED",
        requestId,
        afterData: {
          feedFile,
          feedModels: Object.keys(feed).length,
          feedPriceRecords: records.length,
          matched,
          updated,
          unchanged,
          demoSkipped,
        },
      },
    });

    return {
      feedModels: Object.keys(feed).length,
      feedPriceRecords: records.length,
      matched,
      updated,
      unchanged,
      demoSkipped,
      samples: updates.slice(0, 10).map((update) => ({
        skuName: update.skuName,
        before: update.before,
        after: update.after,
        matchedTitle: update.record.title,
        matchedVersion: update.record.version,
      })),
    };
  }
}
