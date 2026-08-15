"use client";

import {
  EmployeeListSchema,
  OrganizationListSchema,
  RoleListSchema,
  StoreListSchema,
  type Employee,
  type Organization,
  type Role,
  type Store,
} from "@jincheng/contracts";
import { FormEvent, useCallback, useEffect, useState } from "react";

type EmployeeStatusFilter = "" | "ACTIVE" | "LEAVING" | "INACTIVE";

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "在职",
  LEAVING: "离职中",
  INACTIVE: "已停用",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  ACTIVE: "status-active",
  LEAVING: "status-preview",
  INACTIVE: "status-inactive",
};

export function OrganizationManager() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeTotal, setEmployeeTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmployeeStatusFilter>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [showCreateStore, setShowCreateStore] = useState(false);
  const [showCreateEmployee, setShowCreateEmployee] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [storeForm, setStoreForm] = useState({ code: "", name: "" });
  const [employeeForm, setEmployeeForm] = useState({
    employeeNo: "",
    name: "",
    mobile: "",
    storeId: "",
  });

  /** 首屏：组织 + 角色 */
  const loadBase = useCallback(async () => {
    const [orgPayload, rolePayload] = await Promise.all([
      apiFetch("/api/org/organizations"),
      apiFetch("/api/org/roles"),
    ]);
    const orgList = OrganizationListSchema.parse(orgPayload);
    const roleList = RoleListSchema.parse(rolePayload);
    setOrganizations(orgList.items);
    setRoles(roleList.items);
    setSelectedOrgId((current) => current || orgList.items[0]?.id || "");
    return orgList.items;
  }, []);

  /** 选中组织的门店 + 员工分页 */
  const loadOrgDetail = useCallback(
    async (organizationId: string, targetPage: number) => {
      const employeeQuery = new URLSearchParams({
        page: String(targetPage),
        pageSize: String(PAGE_SIZE),
      });
      if (search) employeeQuery.set("search", search);
      if (statusFilter) employeeQuery.set("status", statusFilter);
      const [storePayload, employeePayload] = await Promise.all([
        apiFetch(`/api/org/organizations/${organizationId}/stores`),
        apiFetch(
          `/api/org/organizations/${organizationId}/employees?${employeeQuery}`,
        ),
      ]);
      const storeList = StoreListSchema.parse(storePayload);
      const employeeList = EmployeeListSchema.parse(employeePayload);
      setStores(storeList.items);
      setEmployees(employeeList.items);
      setEmployeeTotal(employeeList.total);
      setTotalPages(employeeList.totalPages);
    },
    [search, statusFilter],
  );

  const reload = useCallback(async () => {
    setError(null);
    try {
      const items = await loadBase();
      const organizationId = selectedOrgId || items[0]?.id;
      if (organizationId) await loadOrgDetail(organizationId, page);
    } catch (loadError) {
      setError(messageOf(loadError));
    }
  }, [loadBase, loadOrgDetail, page, selectedOrgId]);

  useEffect(() => {
    let active = true;
    // loading 初始值即为 true,此处无需再同步 setLoading(react-hooks/set-state-in-effect)
    void (async () => {
      try {
        const items = await loadBase();
        const organizationId = items[0]?.id;
        if (organizationId && active) {
          await loadOrgDetail(organizationId, 1);
        }
        if (active) setError(null);
      } catch (loadError) {
        if (active) setError(messageOf(loadError));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // 仅首屏执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 组织切换或筛选变化后重查门店与员工 */
  useEffect(() => {
    if (!selectedOrgId || loading) return;
    let active = true;
    void (async () => {
      try {
        await loadOrgDetail(selectedOrgId, page);
      } catch (loadError) {
        if (active) setError(messageOf(loadError));
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, page, search, statusFilter]);

  async function runAction(key: string, action: () => Promise<string>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      await reload();
    } catch (actionError) {
      setError(messageOf(actionError));
    } finally {
      setBusy(null);
    }
  }

  const selectedOrg = organizations.find((item) => item.id === selectedOrgId);

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("create-org", async () => {
      await apiFetch("/api/org/organizations", {
        method: "POST",
        body: JSON.stringify({ name: orgName }),
      });
      setOrgName("");
      setShowCreateOrg(false);
      return "组织已创建";
    });
  }

  async function renameOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrgId) return;
    await runAction("rename-org", async () => {
      await apiFetch(`/api/org/organizations/${selectedOrgId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: renameValue }),
      });
      setRenameValue("");
      return "组织名称已更新";
    });
  }

  async function createStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrgId) return;
    await runAction("create-store", async () => {
      await apiFetch("/api/org/stores", {
        method: "POST",
        body: JSON.stringify({
          organizationId: selectedOrgId,
          code: storeForm.code,
          name: storeForm.name,
        }),
      });
      setStoreForm({ code: "", name: "" });
      setShowCreateStore(false);
      return "门店已创建";
    });
  }

  async function syncStoresFromWarehouses() {
    if (!selectedOrgId) return;
    await runAction("sync-stores", async () => {
      const result = (await apiFetch(
        `/api/org/organizations/${selectedOrgId}/stores/sync-from-warehouses`,
        { method: "POST" },
      )) as {
        storeWarehouses?: number;
        storesCreated?: number;
        warehousesLinked?: number;
        alreadyLinked?: number;
      };
      return `门店类仓库共 ${result.storeWarehouses ?? 0} 个：新建门店 ${result.storesCreated ?? 0} 个、本次关联仓库 ${result.warehousesLinked ?? 0} 个、此前已关联 ${result.alreadyLinked ?? 0} 个（总仓/售后/个人仓不参与）`;
    });
  }

  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrgId) return;
    await runAction("create-employee", async () => {
      await apiFetch("/api/org/employees", {
        method: "POST",
        body: JSON.stringify({
          organizationId: selectedOrgId,
          employeeNo: employeeForm.employeeNo,
          name: employeeForm.name,
          mobile: employeeForm.mobile || undefined,
          storeId: employeeForm.storeId || undefined,
        }),
      });
      setEmployeeForm({ employeeNo: "", name: "", mobile: "", storeId: "" });
      setShowCreateEmployee(false);
      return "员工档案已创建";
    });
  }

  return (
    <div className="catalog-workspace">
      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert success">{notice}</div> : null}

      <section className="metric-grid" aria-label="组织摘要">
        <Metric label="组织" value={organizations.length} />
        <Metric label="当前组织门店" value={stores.length} />
        <Metric label="当前组织员工" value={employeeTotal} />
        <Metric label="系统角色" value={roles.length} />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">组织架构</p>
            <h2>组织与门店</h2>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={() => setShowCreateOrg((value) => !value)}
          >
            {showCreateOrg ? "收起" : "+ 新增组织"}
          </button>
        </div>

        {showCreateOrg ? (
          <form className="classification-form" onSubmit={createOrganization}>
            <Field label="组织名称" value={orgName} onChange={setOrgName} />
            <button
              className="button small"
              disabled={busy === "create-org"}
              type="submit"
            >
              {busy === "create-org" ? "创建中…" : "创建组织"}
            </button>
          </form>
        ) : null}

        {organizations.length ? (
          <>
            <div className="organization-row">
              <label>
                <span>当前组织</span>
                <select
                  value={selectedOrgId}
                  onChange={(event) => {
                    setSelectedOrgId(event.target.value);
                    setPage(1);
                  }}
                >
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedOrg ? (
              <form className="classification-form" onSubmit={renameOrganization}>
                <Field
                  label={`重命名「${selectedOrg.name}」`}
                  value={renameValue}
                  onChange={setRenameValue}
                />
                <button
                  className="button small"
                  disabled={busy === "rename-org" || !renameValue.trim()}
                  type="submit"
                >
                  保存名称
                </button>
              </form>
            ) : null}

            <div className="section-heading" style={{ marginTop: 18 }}>
              <div>
                <p className="eyebrow">门店</p>
                <h2>门店清单</h2>
              </div>
              <div className="heading-actions">
                <button
                  className="button accent"
                  type="button"
                  disabled={busy === "sync-stores"}
                  onClick={() => void syncStoresFromWarehouses()}
                >
                  {busy === "sync-stores" ? "同步中…" : "从公司仓库生成门店"}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setShowCreateStore((value) => !value)}
                >
                  {showCreateStore ? "收起" : "+ 新增门店"}
                </button>
              </div>
            </div>

            {showCreateStore ? (
              <form className="classification-form" onSubmit={createStore}>
                <Field
                  label="门店编码"
                  value={storeForm.code}
                  onChange={(code) => setStoreForm({ ...storeForm, code })}
                />
                <Field
                  label="门店名称"
                  value={storeForm.name}
                  onChange={(name) => setStoreForm({ ...storeForm, name })}
                />
                <button
                  className="button small"
                  disabled={busy === "create-store"}
                  type="submit"
                >
                  {busy === "create-store" ? "创建中…" : "创建门店"}
                </button>
              </form>
            ) : null}

            <div className="sku-table-wrap" style={{ marginTop: 12 }}>
              <table className="sku-table">
                <thead>
                  <tr>
                    <th>编码</th>
                    <th>名称</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.length ? (
                    stores.map((store) => (
                      <StoreRow
                        key={store.id}
                        store={store}
                        busy={busy}
                        runAction={runAction}
                      />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3}>暂无门店，可先创建。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : loading ? (
          <div className="loading-state">正在读取组织…</div>
        ) : (
          <EmptyState text="数据库中还没有组织。请先创建组织（通常先运行 pnpm db:seed 初始化）。" />
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">人员</p>
            <h2>员工与登录账号</h2>
          </div>
          <button
            className="button primary"
            type="button"
            disabled={!selectedOrgId}
            onClick={() => setShowCreateEmployee((value) => !value)}
          >
            {showCreateEmployee ? "收起新增" : "+ 新增员工"}
          </button>
        </div>

        <form
          className="catalog-search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <label>
            <span>搜索员工</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="工号、姓名或手机号"
            />
          </label>
          <label>
            <span>状态</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as EmployeeStatusFilter);
                setPage(1);
              }}
            >
              <option value="">全部</option>
              <option value="ACTIVE">在职</option>
              <option value="LEAVING">离职中</option>
              <option value="INACTIVE">已停用</option>
            </select>
          </label>
          <button className="button secondary" type="submit">
            查询
          </button>
        </form>

        {showCreateEmployee ? (
          <form className="form-grid" onSubmit={createEmployee}>
            <Field
              label="员工工号"
              value={employeeForm.employeeNo}
              onChange={(employeeNo) =>
                setEmployeeForm({ ...employeeForm, employeeNo })
              }
            />
            <Field
              label="姓名"
              value={employeeForm.name}
              onChange={(name) => setEmployeeForm({ ...employeeForm, name })}
            />
            <Field
              label="手机号（可选）"
              required={false}
              value={employeeForm.mobile}
              onChange={(mobile) =>
                setEmployeeForm({ ...employeeForm, mobile })
              }
            />
            <StoreSelect
              stores={stores}
              value={employeeForm.storeId}
              onChange={(storeId) =>
                setEmployeeForm({ ...employeeForm, storeId })
              }
            />
            <button
              className="button primary"
              disabled={busy === "create-employee"}
              type="submit"
            >
              {busy === "create-employee" ? "保存中…" : "保存员工"}
            </button>
          </form>
        ) : null}

        {loading ? (
          <div className="loading-state">正在读取员工…</div>
        ) : employees.length ? (
          <>
            <div className="sku-table-wrap">
              <table className="sku-table">
                <thead>
                  <tr>
                    <th>工号</th>
                    <th>姓名</th>
                    <th>手机</th>
                    <th>门店</th>
                    <th>状态</th>
                    <th>登录账号</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <EmployeeRow
                      key={employee.id}
                      employee={employee}
                      stores={stores}
                      roles={roles}
                      busy={busy}
                      runAction={runAction}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="organization-row" style={{ marginTop: 12 }}>
              <button
                className="button small"
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                上一页
              </button>
              <span style={{ fontSize: 12, color: "#687487" }}>
                第 {page} / {Math.max(totalPages, 1)} 页 · 共 {employeeTotal} 人
              </span>
              <button
                className="button small"
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
              </button>
            </div>
          </>
        ) : (
          <EmptyState text="没有符合条件的员工。可调整筛选或新增员工档案。" />
        )}
      </section>
    </div>
  );
}

function StoreRow({
  store,
  busy,
  runAction,
}: {
  store: Store;
  busy: string | null;
  runAction: (key: string, action: () => Promise<string>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ code: store.code, name: store.name });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(`store-${store.id}`, async () => {
      await apiFetch(`/api/org/stores/${store.id}`, {
        method: "PATCH",
        body: JSON.stringify({ code: form.code, name: form.name }),
      });
      setEditing(false);
      return "门店信息已更新";
    });
  }

  return (
    <>
      <tr>
        <td>
          <code>{store.code}</code>
        </td>
        <td>{store.name}</td>
        <td>
          <button
            className="text-button"
            type="button"
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? "收起" : "编辑"}
          </button>
        </td>
      </tr>
      {editing ? (
        <tr>
          <td colSpan={3}>
            <form className="classification-form" onSubmit={save}>
              <Field
                label="门店编码"
                value={form.code}
                onChange={(code) => setForm({ ...form, code })}
              />
              <Field
                label="门店名称"
                value={form.name}
                onChange={(name) => setForm({ ...form, name })}
              />
              <button
                className="button small"
                disabled={busy === `store-${store.id}`}
                type="submit"
              >
                保存
              </button>
            </form>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function EmployeeRow({
  employee,
  stores,
  roles,
  busy,
  runAction,
}: {
  employee: Employee;
  stores: Store[];
  roles: Role[];
  busy: string | null;
  runAction: (key: string, action: () => Promise<string>) => Promise<void>;
}) {
  const [panel, setPanel] = useState<"none" | "edit" | "account">("none");
  const [form, setForm] = useState({
    name: employee.name,
    mobile: employee.mobile ?? "",
    storeId: employee.storeId ?? "",
    status: employee.status,
  });
  const storeName =
    stores.find((store) => store.id === employee.storeId)?.name ?? "—";

  async function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(`employee-${employee.id}`, async () => {
      await apiFetch(`/api/org/employees/${employee.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          mobile: form.mobile || null,
          storeId: form.storeId || null,
          status: form.status,
        }),
      });
      setPanel("none");
      return "员工档案已更新";
    });
  }

  return (
    <>
      <tr>
        <td>
          <code>{employee.employeeNo}</code>
        </td>
        <td>{employee.name}</td>
        <td>{employee.mobile ?? "—"}</td>
        <td>{storeName}</td>
        <td>
          <span
            className={`status-badge ${STATUS_BADGE_CLASS[employee.status] ?? "status-inactive"}`}
          >
            {STATUS_LABELS[employee.status] ?? employee.status}
          </span>
        </td>
        <td>
          {employee.account ? (
            <span>
              <code>{employee.account.username}</code>{" "}
              {employee.account.isFrozen ? (
                <span className="pending-chip">已冻结</span>
              ) : null}
            </span>
          ) : (
            "未开通"
          )}
        </td>
        <td>
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setPanel((value) => (value === "edit" ? "none" : "edit"))
            }
          >
            编辑
          </button>{" "}
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setPanel((value) => (value === "account" ? "none" : "account"))
            }
          >
            账号
          </button>
        </td>
      </tr>
      {panel === "edit" ? (
        <tr>
          <td colSpan={7}>
            <form className="classification-form" onSubmit={saveEmployee}>
              <Field
                label="姓名"
                value={form.name}
                onChange={(name) => setForm({ ...form, name })}
              />
              <Field
                label="手机号"
                required={false}
                value={form.mobile}
                onChange={(mobile) => setForm({ ...form, mobile })}
              />
              <StoreSelect
                stores={stores}
                value={form.storeId}
                onChange={(storeId) => setForm({ ...form, storeId })}
              />
              <label>
                <span>状态</span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as typeof form.status,
                    })
                  }
                >
                  <option value="ACTIVE">在职</option>
                  <option value="LEAVING">离职中</option>
                  <option value="INACTIVE">已停用</option>
                </select>
              </label>
              <button
                className="button small"
                disabled={busy === `employee-${employee.id}`}
                type="submit"
              >
                保存
              </button>
            </form>
          </td>
        </tr>
      ) : null}
      {panel === "account" ? (
        <tr>
          <td colSpan={7}>
            <AccountPanel
              employee={employee}
              roles={roles}
              busy={busy}
              runAction={runAction}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function AccountPanel({
  employee,
  roles,
  busy,
  runAction,
}: {
  employee: Employee;
  roles: Role[];
  busy: string | null;
  runAction: (key: string, action: () => Promise<string>) => Promise<void>;
}) {
  const account = employee.account;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState("");

  function toggleRole(roleId: string) {
    setRoleIds((current) =>
      current.includes(roleId)
        ? current.filter((id) => id !== roleId)
        : [...current, roleId],
    );
  }

  const roleChecks = (
    <div className="organization-row" style={{ flexWrap: "wrap", gap: 10 }}>
      {roles.filter((role) => !role.archivedAt).map((role) => (
        <label className="check-field" key={role.id}>
          <input
            type="checkbox"
            checked={roleIds.includes(role.id)}
            onChange={() => toggleRole(role.id)}
          />
          <span>
            {role.name}（{role.code}）
          </span>
        </label>
      ))}
    </div>
  );

  if (!account) {
    return (
      <form
        className="classification-form"
        style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
        onSubmit={async (event) => {
          event.preventDefault();
          if (roleIds.length === 0) return;
          await runAction(`account-create-${employee.id}`, async () => {
            await apiFetch("/api/org/accounts", {
              method: "POST",
              body: JSON.stringify({
                employeeId: employee.id,
                username,
                password,
                roleIds,
              }),
            });
            return `已为 ${employee.name} 开通登录账号`;
          });
        }}
      >
        <Field label="登录名（字母/数字/._-）" value={username} onChange={setUsername} />
        <label>
          <span>初始密码（至少 8 位）</span>
          <input
            required
            minLength={8}
            maxLength={100}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {roleChecks}
        <button
          className="button small"
          disabled={busy === `account-create-${employee.id}` || roleIds.length === 0}
          type="submit"
        >
          开通账号
        </button>
        {roleIds.length === 0 ? (
          <span className="inline-warning">至少勾选一个角色</span>
        ) : null}
      </form>
    );
  }

  return (
    <div className="classification-form" style={{ display: "grid", gap: 12 }}>
      <div className="organization-row">
        <span>
          登录名 <code>{account.username}</code>
          {account.isFrozen ? <span className="pending-chip">已冻结</span> : null}
        </span>
        <button
          className="button small"
          type="button"
          disabled={busy === `account-freeze-${account.id}`}
          onClick={() =>
            void runAction(`account-freeze-${account.id}`, async () => {
              await apiFetch(`/api/org/accounts/${account.id}`, {
                method: "PATCH",
                body: JSON.stringify({ isFrozen: !account.isFrozen }),
              });
              return account.isFrozen ? "账号已解冻" : "账号已冻结（立即生效）";
            })
          }
        >
          {account.isFrozen ? "解冻账号" : "冻结账号"}
        </button>
      </div>

      <form
        className="organization-row"
        onSubmit={async (event) => {
          event.preventDefault();
          await runAction(`account-reset-${account.id}`, async () => {
            await apiFetch(`/api/org/accounts/${account.id}`, {
              method: "PATCH",
              body: JSON.stringify({ password: newPassword }),
            });
            setNewPassword("");
            return "密码已重置";
          });
        }}
      >
        <label>
          <span>重置密码（至少 8 位）</span>
          <input
            required
            minLength={8}
            maxLength={100}
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <button
          className="button small"
          disabled={busy === `account-reset-${account.id}`}
          type="submit"
        >
          重置密码
        </button>
      </form>

      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (roleIds.length === 0) return;
          await runAction(`account-roles-${account.id}`, async () => {
            await apiFetch(`/api/org/accounts/${account.id}`, {
              method: "PATCH",
              body: JSON.stringify({ roleIds }),
            });
            return "角色已调整";
          });
        }}
      >
        <p style={{ margin: "0 0 6px", fontSize: 12, color: "#687487" }}>
          调整角色（勾选后保存将覆盖现有角色）
        </p>
        {roleChecks}
        <button
          className="button small"
          style={{ marginTop: 10 }}
          disabled={busy === `account-roles-${account.id}` || roleIds.length === 0}
          type="submit"
        >
          保存角色
        </button>
      </form>
    </div>
  );
}

function StoreSelect({
  stores,
  value,
  onChange,
}: {
  stores: Store[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>归属门店（可选）</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">不归属门店</option>
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="metric-card normal">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <strong>暂无数据</strong>
      <span>{text}</span>
    </div>
  );
}

async function apiFetch(input: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(input, {
    cache: "no-store",
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  if (!response.ok) {
    const message = Array.isArray(payload.message)
      ? payload.message.join("；")
      : payload.message;
    throw new Error(message || `请求失败（${response.status}）`);
  }
  return payload;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "发生未知错误";
}
