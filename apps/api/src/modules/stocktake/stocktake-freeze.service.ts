import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import { Prisma, StocktakeStatus } from "@jincheng/database";
import { DatabaseService } from "../../database/database.service.js";

/**
 * 仓库盘点封存检查(2026-08-12 业务确认:盘库期间不能调库,免得造成混乱)。
 *
 * 封存窗口 = 盘点单处于 COUNTING/SUBMITTED/APPROVED(开始盘点后直到过账或取消)。
 * 差异未过账前解封会导致差异快照失效,因此提交/审批中同样保持封存。
 *
 * 接入点:调拨建单/锁定/发出/接收、采购扫码收货;
 * 未来的销售出库、个人库领用等一切库存变动同样必须先过此检查。
 */
@Injectable()
export class StocktakeFreezeService {
  /** 处于封存窗口的盘点单状态 */
  static readonly FROZEN_STATUSES: StocktakeStatus[] = [
    StocktakeStatus.COUNTING,
    StocktakeStatus.SUBMITTED,
    StocktakeStatus.APPROVED,
  ];

  constructor(private readonly database: DatabaseService) {}

  /**
   * 断言指定仓库均未被盘点封存,否则抛 422。
   * 在业务事务内调用时传入 tx,保证与库存变动同一事务读取。
   */
  async assertNotFrozen(
    warehouseIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const ids = [...new Set(warehouseIds.filter(Boolean))];
    if (ids.length === 0) return;
    const client = tx ?? this.database.client;
    const active = await client.stocktakeOrder.findFirst({
      where: {
        warehouseId: { in: ids },
        status: { in: StocktakeFreezeService.FROZEN_STATUSES },
      },
      select: {
        code: true,
        status: true,
        warehouse: { select: { name: true } },
      },
    });
    if (active) {
      throw new UnprocessableEntityException(
        `仓库「${active.warehouse.name}」正在盘点封存中(${active.code}),盘点结束前禁止调拨与出入库`,
      );
    }
  }
}
