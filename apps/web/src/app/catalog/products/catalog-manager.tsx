"use client";

import {
  CatalogImportBatchSchema,
  CatalogProductListSchema,
  type CatalogImportBatch,
  type CatalogProduct,
} from "@jincheng/contracts";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

interface OrganizationOption {
  id: string;
  name: string;
}

interface ApiErrorPayload {
  message?: string | string[];
}

interface CatalogSnapshot {
  products: CatalogProduct[];
  imports: CatalogImportBatch[];
  organizations: OrganizationOption[];
}

const emptyProductForm = {
  code: "",
  brand: "",
  category: "",
  modelName: "",
  skuCode: "",
  skuName: "",
  barcode: "",
  serialManaged: true,
};

export function CatalogManager() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [imports, setImports] = useState<CatalogImportBatch[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "ACTIVE" | "INACTIVE">("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [productForm, setProductForm] = useState(emptyProductForm);

  const applySnapshot = useCallback((snapshot: CatalogSnapshot) => {
    setProducts(snapshot.products);
    setImports(snapshot.imports);
    setOrganizations(snapshot.organizations);
    setOrganizationId(
      (current) => current || snapshot.organizations[0]?.id || "",
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applySnapshot(await fetchCatalogSnapshot(search, status));
    } catch (loadError) {
      setError(messageOf(loadError));
    } finally {
      setLoading(false);
    }
  }, [applySnapshot, search, status]);

  useEffect(() => {
    let active = true;
    void fetchCatalogSnapshot(search, status)
      .then((snapshot) => {
        if (!active) return;
        applySnapshot(snapshot);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(messageOf(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applySnapshot, search, status]);

  const counts = useMemo(
    () => ({
      products: products.length,
      skus: products.reduce((sum, product) => sum + product.skus.length, 0),
      pending: products.filter(
        (product) => product.classificationStatus === "PENDING",
      ).length,
    }),
    [products],
  );

  async function runAction(key: string, action: () => Promise<string>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      await load();
    } catch (actionError) {
      setError(messageOf(actionError));
    } finally {
      setBusy(null);
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) {
      setError("当前数据库没有可用组织，需先完成组织初始化");
      return;
    }
    await runAction("create-product", async () => {
      await apiFetch("/api/catalog/products", {
        method: "POST",
        body: JSON.stringify({
          organizationId,
          code: productForm.code,
          brand: productForm.brand,
          category: productForm.category,
          modelName: productForm.modelName,
          skus: [
            {
              code: productForm.skuCode,
              name: productForm.skuName,
              barcode: productForm.barcode || undefined,
              serialManaged: productForm.serialManaged,
            },
          ],
        }),
      });
      setProductForm(emptyProductForm);
      setShowCreate(false);
      return "商品和首个 SKU 已创建，并写入审计记录";
    });
  }

  async function previewImport() {
    await runAction("preview-import", async () => {
      const payload = CatalogImportBatchSchema.parse(
        await apiFetch("/api/catalog/imports/bytestar/preview", {
          method: "POST",
        }),
      );
      return payload.duplicate
        ? "该 CDS 内容已预览过，已返回原批次"
        : `预校验完成：${payload.validRows.toLocaleString()} 行有效，${payload.invalidRows.toLocaleString()} 行需处理`;
    });
  }

  async function applyImport(batch: CatalogImportBatch) {
    if (!organizationId) {
      setError("请选择货品归属组织后再应用批次");
      return;
    }
    await runAction(`apply-${batch.id}`, async () => {
      const result = (await apiFetch(`/api/catalog/imports/${batch.id}/apply`, {
        method: "POST",
        body: JSON.stringify({ organizationId }),
      })) as {
        productsCreated?: number;
        skusCreated?: number;
        inventoryRowsCreated?: number;
      };
      return `批次已应用：新增 ${result.productsCreated ?? 0} 个商品、${result.skusCreated ?? 0} 个 SKU；库存写入 ${result.inventoryRowsCreated ?? 0} 行`;
    });
  }

  return (
    <div className="catalog-workspace">
      <section className="catalog-toolbar" aria-label="货品筛选和操作">
        <form
          className="catalog-search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
          }}
        >
          <label>
            <span>搜索货品</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="商品编码、SKU、名称或条码"
            />
          </label>
          <label>
            <span>状态</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as typeof status)
              }
            >
              <option value="">全部</option>
              <option value="ACTIVE">启用</option>
              <option value="INACTIVE">停用</option>
            </select>
          </label>
          <button className="button secondary" type="submit">
            查询
          </button>
        </form>
        <button
          className="button primary"
          type="button"
          onClick={() => setShowCreate((value) => !value)}
        >
          {showCreate ? "收起新增" : "+ 新增商品"}
        </button>
      </section>

      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert success">{notice}</div> : null}

      <section className="metric-grid" aria-label="货品摘要">
        <Metric label="当前页商品" value={counts.products} />
        <Metric label="当前页 SKU" value={counts.skus} />
        <Metric
          label="待归类商品"
          value={counts.pending}
          tone={counts.pending ? "warning" : "normal"}
        />
        <Metric label="管家婆批次" value={imports.length} />
      </section>

      {showCreate ? (
        <section className="panel create-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">手工建档</p>
              <h2>新增商品与首个 SKU</h2>
            </div>
          </div>
          <form className="form-grid" onSubmit={createProduct}>
            <OrganizationSelect
              organizations={organizations}
              value={organizationId}
              onChange={setOrganizationId}
            />
            <Field
              label="商品编码"
              value={productForm.code}
              onChange={(code) => setProductForm({ ...productForm, code })}
            />
            <Field
              label="品牌"
              value={productForm.brand}
              onChange={(brand) => setProductForm({ ...productForm, brand })}
            />
            <Field
              label="品类"
              value={productForm.category}
              onChange={(category) =>
                setProductForm({ ...productForm, category })
              }
            />
            <Field
              label="型号名称"
              value={productForm.modelName}
              onChange={(modelName) =>
                setProductForm({ ...productForm, modelName })
              }
            />
            <Field
              label="SKU 编码"
              value={productForm.skuCode}
              onChange={(skuCode) =>
                setProductForm({ ...productForm, skuCode })
              }
            />
            <Field
              label="SKU 名称"
              value={productForm.skuName}
              onChange={(skuName) =>
                setProductForm({ ...productForm, skuName })
              }
            />
            <Field
              label="主条码（可选）"
              required={false}
              value={productForm.barcode}
              onChange={(barcode) =>
                setProductForm({ ...productForm, barcode })
              }
            />
            <label className="check-field">
              <input
                type="checkbox"
                checked={productForm.serialManaged}
                onChange={(event) =>
                  setProductForm({
                    ...productForm,
                    serialManaged: event.target.checked,
                  })
                }
              />
              <span>按 IMEI/SN 管理</span>
            </label>
            <button
              className="button primary"
              disabled={busy === "create-product"}
              type="submit"
            >
              {busy === "create-product" ? "保存中…" : "保存商品"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="panel import-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">智储星数据源</p>
            <h2>管家婆 CDS 预校验</h2>
            <p>
              相同文件按 SHA-256 去重；错误行保留，应用后仍不会生成库存余额。
            </p>
          </div>
          <button
            className="button accent"
            type="button"
            disabled={busy === "preview-import"}
            onClick={previewImport}
          >
            {busy === "preview-import" ? "解析中…" : "读取最新 CDS"}
          </button>
        </div>
        <div className="organization-row">
          <OrganizationSelect
            organizations={organizations}
            value={organizationId}
            onChange={setOrganizationId}
          />
          {!organizations.length ? (
            <span className="inline-warning">
              暂无组织，批次可预览但不能应用
            </span>
          ) : null}
        </div>
        <div className="batch-list">
          {imports.length ? (
            imports.map((batch) => (
              <article className="batch-card" key={batch.id}>
                <div>
                  <strong>{batch.sourceRef}</strong>
                  <span>{formatDate(batch.sourceCapturedAt)}</span>
                </div>
                <dl>
                  <div>
                    <dt>有效</dt>
                    <dd>{batch.validRows.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>错误</dt>
                    <dd className={batch.invalidRows ? "danger-text" : ""}>
                      {batch.invalidRows.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt>货品</dt>
                    <dd>{batch.uniqueSkus.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>仓库</dt>
                    <dd>{batch.warehouseCount.toLocaleString()}</dd>
                  </div>
                </dl>
                <div className="batch-action">
                  <StatusBadge status={batch.status} />
                  {batch.status === "PREVIEW" ? (
                    <button
                      className="button small"
                      type="button"
                      disabled={busy === `apply-${batch.id}` || !organizationId}
                      onClick={() => applyImport(batch)}
                    >
                      {busy === `apply-${batch.id}`
                        ? "应用中…"
                        : "应用为待归类货品"}
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <EmptyState text="尚无管家婆导入批次，可先读取最新 CDS 生成预览。" />
          )}
        </div>
      </section>

      <section className="panel product-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">货品主档</p>
            <h2>商品与 SKU</h2>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={() => void load()}
          >
            刷新
          </button>
        </div>
        {loading ? (
          <div className="loading-state">正在读取货品…</div>
        ) : products.length ? (
          <div className="product-list">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                busy={busy}
                runAction={runAction}
              />
            ))}
          </div>
        ) : (
          <EmptyState text="没有符合条件的商品。可手工新增，或先预览管家婆 CDS。" />
        )}
      </section>
    </div>
  );
}

function ProductCard({
  product,
  busy,
  runAction,
}: {
  product: CatalogProduct;
  busy: string | null;
  runAction: (key: string, action: () => Promise<string>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(
    product.classificationStatus === "PENDING",
  );
  const [classification, setClassification] = useState({
    brand: product.brand === "待归类" ? "" : product.brand,
    category: product.category === "待归类" ? "" : product.category,
    modelName: product.modelName,
  });
  const [showSkuForm, setShowSkuForm] = useState(false);
  const [skuForm, setSkuForm] = useState({
    code: "",
    name: "",
    barcode: "",
    serialManaged: true,
  });

  async function saveClassification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(`classify-${product.id}`, async () => {
      await apiFetch(`/api/catalog/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...classification,
          classificationStatus: "CONFIRMED",
        }),
      });
      setEditing(false);
      return "商品归类已确认";
    });
  }

  async function addSku(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(`add-sku-${product.id}`, async () => {
      await apiFetch(`/api/catalog/products/${product.id}/skus`, {
        method: "POST",
        body: JSON.stringify({
          ...skuForm,
          barcode: skuForm.barcode || undefined,
        }),
      });
      setSkuForm({ code: "", name: "", barcode: "", serialManaged: true });
      setShowSkuForm(false);
      return "SKU 已新增";
    });
  }

  return (
    <article className="product-card">
      <div className="product-main">
        <div className="product-title-row">
          <div>
            <div className="code-line">
              <code>{product.code}</code>
              <StatusBadge status={product.status} />
            </div>
            <h3>{product.modelName}</h3>
            <p>
              {product.brand} · {product.category}
            </p>
          </div>
          <div className="product-actions">
            {product.classificationStatus === "PENDING" ? (
              <span className="pending-chip">待归类</span>
            ) : null}
            <button
              className="text-button"
              type="button"
              disabled={busy === `status-${product.id}`}
              onClick={() =>
                void runAction(`status-${product.id}`, async () => {
                  const next =
                    product.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
                  await apiFetch(`/api/catalog/products/${product.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: next }),
                  });
                  return next === "ACTIVE" ? "商品已启用" : "商品已停用";
                })
              }
            >
              {product.status === "ACTIVE" ? "停用" : "启用"}
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setShowSkuForm((value) => !value)}
            >
              + SKU
            </button>
          </div>
        </div>

        {editing ? (
          <form className="classification-form" onSubmit={saveClassification}>
            <Field
              label="品牌"
              value={classification.brand}
              onChange={(brand) =>
                setClassification({ ...classification, brand })
              }
            />
            <Field
              label="品类"
              value={classification.category}
              onChange={(category) =>
                setClassification({ ...classification, category })
              }
            />
            <Field
              label="型号名称"
              value={classification.modelName}
              onChange={(modelName) =>
                setClassification({ ...classification, modelName })
              }
            />
            <button
              className="button small"
              disabled={busy === `classify-${product.id}`}
              type="submit"
            >
              确认归类
            </button>
          </form>
        ) : null}

        {showSkuForm ? (
          <form className="classification-form" onSubmit={addSku}>
            <Field
              label="SKU 编码"
              value={skuForm.code}
              onChange={(code) => setSkuForm({ ...skuForm, code })}
            />
            <Field
              label="SKU 名称"
              value={skuForm.name}
              onChange={(name) => setSkuForm({ ...skuForm, name })}
            />
            <Field
              label="主条码（可选）"
              required={false}
              value={skuForm.barcode}
              onChange={(barcode) => setSkuForm({ ...skuForm, barcode })}
            />
            <label className="check-field">
              <input
                type="checkbox"
                checked={skuForm.serialManaged}
                onChange={(event) =>
                  setSkuForm({
                    ...skuForm,
                    serialManaged: event.target.checked,
                  })
                }
              />
              <span>按 IMEI/SN 管理</span>
            </label>
            <button
              className="button small"
              disabled={busy === `add-sku-${product.id}`}
              type="submit"
            >
              保存 SKU
            </button>
          </form>
        ) : null}
      </div>
      <div className="sku-table-wrap">
        <table className="sku-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>名称</th>
              <th>规格</th>
              <th>条码</th>
              <th>管理</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {product.skus.map((sku) => (
              <tr key={sku.id}>
                <td>
                  <code>{sku.code}</code>
                </td>
                <td>{sku.name}</td>
                <td>
                  {[sku.color, sku.capacity].filter(Boolean).join(" / ") || "—"}
                </td>
                <td>{sku.barcodes.join("、") || sku.barcode || "—"}</td>
                <td>{sku.serialManaged ? "一机一码" : "数量"}</td>
                <td>
                  <StatusBadge status={sku.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
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

function OrganizationSelect({
  organizations,
  value,
  onChange,
}: {
  organizations: OrganizationOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>归属组织</span>
      <select
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">请选择</option>
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Metric({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: number;
  tone?: "normal" | "warning";
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    ACTIVE: "启用",
    INACTIVE: "停用",
    PREVIEW: "待应用",
    APPLIED: "已应用",
    REJECTED: "已拒绝",
  };
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      {labels[status] ?? status}
    </span>
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
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  return readJson(response);
}

async function fetchCatalogSnapshot(
  search: string,
  status: "" | "ACTIVE" | "INACTIVE",
): Promise<CatalogSnapshot> {
  const query = new URLSearchParams({ page: "1", pageSize: "50" });
  if (search) query.set("search", search);
  if (status) query.set("status", status);
  const [productResponse, importResponse, organizationResponse] =
    await Promise.all([
      fetch(`/api/catalog/products?${query}`, { cache: "no-store" }),
      fetch("/api/catalog/imports", { cache: "no-store" }),
      fetch("/api/catalog/organizations", { cache: "no-store" }),
    ]);
  const productPayload = await readJson(productResponse);
  const importPayload = await readJson(importResponse);
  const organizationPayload = await readJson(organizationResponse);
  return {
    products: CatalogProductListSchema.parse(productPayload).items,
    imports: CatalogImportBatchSchema.array().parse(importPayload),
    organizations: Array.isArray(organizationPayload)
      ? (organizationPayload as OrganizationOption[])
      : [],
  };
}

async function readJson(response: Response): Promise<unknown> {
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
