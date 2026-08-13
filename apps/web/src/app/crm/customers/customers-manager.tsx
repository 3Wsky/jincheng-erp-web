"use client";

import {
  CustomerDetailSchema,
  CustomerListSchema,
  type CustomerDetail,
  type CustomerDuplicate,
  type CustomerList,
  type FollowupResultValue,
} from "@jincheng/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_SIZE = 20;

/** 回访结果枚举中文(REQ-PEOPLE-010 的 8 个标准值) */
const RESULT_LABELS: Record<FollowupResultValue, string> = {
  NO_DEMAND: "无需求",
  INTERESTED: "有意向",
  PENDING_QUOTE: "待报价",
  PENDING_VISIT: "待到店",
  DEAL_DONE: "已成交",
  REFUSED_CONTACT: "拒绝联系",
  INVALID_NUMBER: "号码无效",
  FOLLOW_UP_LATER: "下次跟进",
};

const RESULT_BADGE_CLASS: Record<FollowupResultValue, string> = {
  NO_DEMAND: "status-inactive",
  INTERESTED: "status-active",
  PENDING_QUOTE: "status-preview",
  PENDING_VISIT: "status-preview",
  DEAL_DONE: "status-active",
  REFUSED_CONTACT: "status-inactive",
  INVALID_NUMBER: "status-inactive",
  FOLLOW_UP_LATER: "status-info",
};

/** 回访方式常用值(枚举待业务确认,先提供快捷选项+自由输入) */
const METHOD_OPTIONS = ["电话", "微信", "到店", "上门", "其他"];

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
      duplicate?: CustomerDuplicate;
    };
    const message = Array.isArray(payload.message)
      ? payload.message[0]
      : payload.message;
    const error = new Error(
      message || `请求失败(HTTP ${response.status})`,
    ) as Error & { duplicate?: CustomerDuplicate };
    if (payload.duplicate) error.duplicate = payload.duplicate;
    throw error;
  }
  return response.json();
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

/** 下次回访是否已到期(列表红点提示) */
function isDue(value: string | null): boolean {
  return Boolean(value) && new Date(value as string).getTime() <= Date.now();
}

interface EmployeeOption {
  id: string;
  name: string;
}

export function CustomersManager() {
  const [list, setList] = useState<CustomerList | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createSource, setCreateSource] = useState("");
  const [createOwner, setCreateOwner] = useState("");
  const [createRemark, setCreateRemark] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<CustomerDuplicate | null>(null);

  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [followMethod, setFollowMethod] = useState("电话");
  const [followResult, setFollowResult] =
    useState<FollowupResultValue>("FOLLOW_UP_LATER");
  const [followNote, setFollowNote] = useState("");
  const [followIntent, setFollowIntent] = useState("");
  const [followNextAt, setFollowNextAt] = useState("");

  const [busy, setBusy] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => setRefreshTick((tick) => tick + 1), []);

  // 列表加载(搜索防抖 300ms)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({
            page: String(page),
            pageSize: String(PAGE_SIZE),
          });
          if (search.trim()) params.set("search", search.trim());
          const payload = CustomerListSchema.parse(
            await fetchJson(`/api/customers?${params}`),
          );
          setList(payload);
          setListError(null);
        } catch (error) {
          setListError(messageOf(error));
        }
      })();
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, page, refreshTick]);

  // 员工下拉(归属销售):取第一个组织的在职员工
  useEffect(() => {
    void (async () => {
      try {
        const orgs = (await fetchJson("/api/org/organizations")) as Array<{
          id: string;
        }>;
        const firstOrg = orgs[0];
        if (!firstOrg) return;
        const payload = (await fetchJson(
          `/api/org/organizations/${firstOrg.id}/employees?pageSize=100&status=ACTIVE`,
        )) as { items?: Array<{ id: string; name: string }> };
        setEmployees(
          (payload.items ?? []).map((item) => ({ id: item.id, name: item.name })),
        );
      } catch {
        // 员工下拉失败不阻塞客户管理主流程(无 org 权限时表单退化为不选归属)
        setEmployees([]);
      }
    })();
  }, []);

  const openDetail = useCallback(async (id: string) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailError(null);
    setActionError(null);
    setDetailLoading(true);
    setFollowMethod("电话");
    setFollowResult("FOLLOW_UP_LATER");
    setFollowNote("");
    setFollowIntent("");
    setFollowNextAt("");
    try {
      const payload = CustomerDetailSchema.parse(
        await fetchJson(`/api/customers/${id}`),
      );
      setDetail(payload);
    } catch (error) {
      setDetailError(messageOf(error));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const createCustomer = useCallback(
    async (allowDuplicate: boolean) => {
      setBusy("create");
      setCreateError(null);
      try {
        const payload = CustomerDetailSchema.parse(
          await fetchJson("/api/customers", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: createName.trim(),
              phone: createPhone.trim() || undefined,
              sourceChannel: createSource.trim() || undefined,
              ownerEmployeeId: createOwner || undefined,
              remark: createRemark.trim() || undefined,
              allowDuplicate: allowDuplicate || undefined,
            }),
          }),
        );
        setShowCreate(false);
        setCreateName("");
        setCreatePhone("");
        setCreateSource("");
        setCreateOwner("");
        setCreateRemark("");
        setDuplicate(null);
        refresh();
        setDetail(payload);
        setDetailOpen(true);
      } catch (error) {
        const withDuplicate = error as Error & {
          duplicate?: CustomerDuplicate;
        };
        setDuplicate(withDuplicate.duplicate ?? null);
        setCreateError(messageOf(error));
      } finally {
        setBusy(null);
      }
    },
    [createName, createPhone, createSource, createOwner, createRemark, refresh],
  );

  const addFollowup = useCallback(async () => {
    if (!detail) return;
    setBusy("followup");
    setActionError(null);
    try {
      const payload = CustomerDetailSchema.parse(
        await fetchJson(`/api/customers/${detail.id}/followups`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            method: followMethod.trim() || undefined,
            result: followResult,
            note: followNote.trim() || undefined,
            intentProduct: followIntent.trim() || undefined,
            nextFollowupAt: followNextAt
              ? new Date(followNextAt).toISOString()
              : undefined,
          }),
        }),
      );
      setDetail(payload);
      setFollowNote("");
      setFollowIntent("");
      setFollowNextAt("");
      refresh();
    } catch (error) {
      setActionError(messageOf(error));
    } finally {
      setBusy(null);
    }
  }, [detail, followMethod, followResult, followNote, followIntent, followNextAt, refresh]);

  const archiveCustomer = useCallback(async () => {
    if (!detail) return;
    if (!window.confirm(`确认作废客户「${detail.name}」？回访历史保留可追溯。`)) {
      return;
    }
    setBusy("archive");
    setActionError(null);
    try {
      const payload = CustomerDetailSchema.parse(
        await fetchJson(`/api/customers/${detail.id}/archive`, {
          method: "POST",
        }),
      );
      setDetail(payload);
      refresh();
    } catch (error) {
      setActionError(messageOf(error));
    } finally {
      setBusy(null);
    }
  }, [detail, refresh]);

  const totalPages = list?.totalPages ?? 1;

  return (
    <div className="customers-manager">
      {/* 工具栏:搜索 + 新建 */}
      <section className="panel customer-toolbar">
        <input
          className="input customer-search"
          placeholder="搜索客户姓名或手机号…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <button
          className="button primary"
          type="button"
          onClick={() => {
            setShowCreate((value) => !value);
            setCreateError(null);
            setDuplicate(null);
          }}
        >
          {showCreate ? "收起表单" : "新建客户"}
        </button>
      </section>

      {/* 新建表单 */}
      {showCreate ? (
        <section className="panel customer-create">
          <h2>新建客户档案</h2>
          <div className="customer-create-grid">
            <label>
              <span>姓名 *</span>
              <input
                className="input"
                maxLength={50}
                placeholder="客户姓名"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
              />
            </label>
            <label>
              <span>手机号</span>
              <input
                className="input"
                maxLength={20}
                placeholder="用于重复识别,展示时自动脱敏"
                value={createPhone}
                onChange={(event) => {
                  setCreatePhone(event.target.value);
                  setDuplicate(null);
                  setCreateError(null);
                }}
              />
            </label>
            <label>
              <span>来源渠道</span>
              <input
                className="input"
                maxLength={30}
                placeholder="如:自然到店 / 短视频 / 老客介绍"
                value={createSource}
                onChange={(event) => setCreateSource(event.target.value)}
              />
            </label>
            <label>
              <span>归属销售</span>
              <select
                className="input"
                value={createOwner}
                onChange={(event) => setCreateOwner(event.target.value)}
              >
                <option value="">暂不指定</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="customer-create-remark">
              <span>备注</span>
              <input
                className="input"
                maxLength={500}
                placeholder="选填"
                value={createRemark}
                onChange={(event) => setCreateRemark(event.target.value)}
              />
            </label>
          </div>

          {createError ? (
            <div className="alert error">
              {createError}
              {duplicate ? (
                <div className="customer-duplicate">
                  <span>
                    已有客户：<b>{duplicate.name}</b>（{duplicate.phoneMasked ?? "无手机号"}
                    {duplicate.ownerEmployeeName
                      ? ` · 归属 ${duplicate.ownerEmployeeName}`
                      : ""}
                    ）
                  </span>
                  <div className="customer-duplicate-actions">
                    <button
                      className="button small"
                      type="button"
                      onClick={() => void openDetail(duplicate.id)}
                    >
                      查看已有客户
                    </button>
                    <button
                      className="button small secondary"
                      disabled={busy === "create"}
                      type="button"
                      onClick={() => void createCustomer(true)}
                    >
                      确认是不同客户，仍然创建
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <button
            className="button primary"
            disabled={busy === "create" || !createName.trim()}
            type="button"
            onClick={() => void createCustomer(false)}
          >
            {busy === "create" ? "创建中…" : "创建客户"}
          </button>
        </section>
      ) : null}

      {/* 客户列表 */}
      <section className="panel">
        {listError ? <div className="alert error">{listError}</div> : null}
        {list && list.items.length === 0 ? (
          <div className="empty-state">
            {search ? "没有匹配的客户" : "还没有客户档案，点击右上角新建"}
          </div>
        ) : null}
        {list && list.items.length > 0 ? (
          <>
            <div className="drawer-table-wrap">
              <table className="drawer-table customer-table">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>手机号</th>
                    <th>来源</th>
                    <th>归属销售</th>
                    <th>回访</th>
                    <th>最近回访</th>
                    <th>下次回访</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((customer) => (
                    <tr
                      className={customer.archivedAt ? "customer-archived" : ""}
                      key={customer.id}
                      onClick={() => void openDetail(customer.id)}
                    >
                      <td>
                        <b>{customer.name}</b>
                        {customer.archivedAt ? (
                          <span className="status-badge status-inactive">已作废</span>
                        ) : null}
                      </td>
                      <td className="mono">{customer.phoneMasked ?? "—"}</td>
                      <td>{customer.sourceChannel ?? "—"}</td>
                      <td>{customer.ownerEmployeeName ?? "—"}</td>
                      <td>{customer.followupCount}</td>
                      <td>{formatDate(customer.lastFollowupAt)}</td>
                      <td>
                        {customer.nextFollowupAt ? (
                          <span
                            className={
                              isDue(customer.nextFollowupAt)
                                ? "customer-due"
                                : undefined
                            }
                          >
                            {formatDate(customer.nextFollowupAt)}
                            {isDue(customer.nextFollowupAt) ? " · 已到期" : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 ? (
              <div className="search-pagination">
                <button
                  className="button small"
                  disabled={page <= 1}
                  type="button"
                  onClick={() => setPage((value) => value - 1)}
                >
                  上一页
                </button>
                <span>
                  {page} / {totalPages}（共 {list.total} 位客户）
                </span>
                <button
                  className="button small"
                  disabled={page >= totalPages}
                  type="button"
                  onClick={() => setPage((value) => value + 1)}
                >
                  下一页
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {/* 详情抽屉 */}
      {detailOpen ? (
        <div
          className="drawer-overlay"
          onClick={() => setDetailOpen(false)}
          role="presentation"
        >
          <aside
            aria-label="客户详情"
            className="warehouse-drawer customer-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="drawer-head">
              <div>
                <h2>
                  {detail?.name ?? "客户详情"}
                  {detail?.archivedAt ? (
                    <span className="status-badge status-inactive">已作废</span>
                  ) : null}
                </h2>
                <small className="mono">
                  {detail ? (detail.phoneMasked ?? "未登记手机号") : "正在加载…"}
                </small>
              </div>
              <button
                aria-label="关闭"
                className="drawer-close"
                type="button"
                onClick={() => setDetailOpen(false)}
              >
                ✕
              </button>
            </header>
            {detailLoading ? <p className="drawer-empty">加载中…</p> : null}
            {detailError ? <p className="drawer-empty error">{detailError}</p> : null}
            {detail ? (
              <>
                <dl className="customer-meta">
                  <div>
                    <dt>来源渠道</dt>
                    <dd>{detail.sourceChannel ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>归属销售</dt>
                    <dd>{detail.ownerEmployeeName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>建档人</dt>
                    <dd>{detail.createdByName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>建档时间</dt>
                    <dd>{formatDateTime(detail.createdAt)}</dd>
                  </div>
                  {detail.remark ? (
                    <div className="customer-meta-wide">
                      <dt>备注</dt>
                      <dd>{detail.remark}</dd>
                    </div>
                  ) : null}
                  {detail.identities.length > 0 ? (
                    <div className="customer-meta-wide">
                      <dt>外部身份</dt>
                      <dd>
                        {detail.identities
                          .map(
                            (identity) =>
                              `${identity.sourceSystem}:${identity.sourceId}`,
                          )
                          .join("、")}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {actionError ? (
                  <div className="alert error">{actionError}</div>
                ) : null}

                {!detail.archivedAt ? (
                  <div className="drawer-section customer-followup-form">
                    <h3>添加回访</h3>
                    <div className="customer-followup-grid">
                      <label>
                        <span>方式</span>
                        <select
                          className="input"
                          value={followMethod}
                          onChange={(event) => setFollowMethod(event.target.value)}
                        >
                          {METHOD_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>结果 *</span>
                        <select
                          className="input"
                          value={followResult}
                          onChange={(event) =>
                            setFollowResult(
                              event.target.value as FollowupResultValue,
                            )
                          }
                        >
                          {Object.entries(RESULT_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {followResult === "INTERESTED" ? (
                        <label>
                          <span>意向商品</span>
                          <input
                            className="input"
                            maxLength={100}
                            placeholder="如:Mate 80 Pro 16+512"
                            value={followIntent}
                            onChange={(event) => setFollowIntent(event.target.value)}
                          />
                        </label>
                      ) : null}
                      <label>
                        <span>下次回访</span>
                        <input
                          className="input"
                          type="datetime-local"
                          value={followNextAt}
                          onChange={(event) => setFollowNextAt(event.target.value)}
                        />
                      </label>
                      <label className="customer-followup-note">
                        <span>备注</span>
                        <input
                          className="input"
                          maxLength={500}
                          placeholder="沟通要点(选填)"
                          value={followNote}
                          onChange={(event) => setFollowNote(event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="customer-followup-actions">
                      <button
                        className="button primary"
                        disabled={busy === "followup"}
                        type="button"
                        onClick={() => void addFollowup()}
                      >
                        {busy === "followup" ? "提交中…" : "记录回访"}
                      </button>
                      <button
                        className="button ghost"
                        disabled={busy !== null}
                        type="button"
                        onClick={() => void archiveCustomer()}
                      >
                        作废客户
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="drawer-section">
                  <h3>回访时间线（{detail.followups.length} 次）</h3>
                  {detail.followups.length === 0 ? (
                    <div className="empty-state">还没有回访记录</div>
                  ) : (
                    <ol className="customer-timeline">
                      {detail.followups.map((followup) => (
                        <li key={followup.id}>
                          <div className="customer-timeline-head">
                            <span
                              className={`status-badge ${RESULT_BADGE_CLASS[followup.result]}`}
                            >
                              {RESULT_LABELS[followup.result]}
                            </span>
                            <small>
                              {formatDateTime(followup.occurredAt)}
                              {followup.method ? ` · ${followup.method}` : ""}
                              {followup.createdByName
                                ? ` · ${followup.createdByName}`
                                : ""}
                            </small>
                          </div>
                          {followup.intentProduct ? (
                            <p>意向：{followup.intentProduct}</p>
                          ) : null}
                          {followup.note ? <p>{followup.note}</p> : null}
                          {followup.nextFollowupAt ? (
                            <small
                              className={
                                isDue(followup.nextFollowupAt)
                                  ? "customer-due"
                                  : "customer-next"
                              }
                            >
                              下次回访：{formatDateTime(followup.nextFollowupAt)}
                              {isDue(followup.nextFollowupAt) ? " · 已到期" : ""}
                            </small>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
