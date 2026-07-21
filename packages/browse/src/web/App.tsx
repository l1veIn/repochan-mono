import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getJSON, type GraphNode, type Health, type OrderSummary } from "./api";
import { statusBadge } from "./components";
import { OrdersView } from "./views/OrdersView";
import { OrderDetailView } from "./views/OrderDetailView";
import { PersonaView } from "./views/PersonaView";
import { ArtifactView } from "./views/ArtifactView";
import { CanvasView } from "./views/CanvasView";

type View =
  | { name: "orders" }
  | { name: "order"; orderId: string }
  | { name: "persona" }
  | { name: "analysis" }
  | { name: "interview" }
  | { name: "canvas" };

function parseHash(): View {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [head, arg] = hash.split("/");
  if (head === "order" && arg) return { name: "order", orderId: decodeURIComponent(arg) };
  if (head === "persona" || head === "analysis" || head === "interview" || head === "canvas") return { name: head };
  return { name: "orders" };
}

function viewHash(view: View): string {
  return view.name === "order" ? `#/order/${encodeURIComponent(view.orderId)}` : `#/${view.name}`;
}

function Inspector(props: {
  view: View;
  order: OrderSummary | null;
  canvasNode: GraphNode | null;
  onOpenOrder: (orderId: string) => void;
}) {
  const { view, order, canvasNode, onOpenOrder } = props;
  if (canvasNode) {
    return (
      <aside className="inspector">
        <h3>Inspector</h3>
        <dl className="kv">
          <dt>node</dt><dd>{canvasNode.id}</dd>
          <dt>kind</dt><dd>{canvasNode.kind}</dd>
          {canvasNode.status ? (<><dt>status</dt><dd>{canvasNode.status}</dd></>) : null}
          {canvasNode.assetType ? (<><dt>assetType</dt><dd>{canvasNode.assetType}</dd></>) : null}
          {canvasNode.foundation ? (<><dt>role</dt><dd>foundation anchor</dd></>) : null}
        </dl>
        {canvasNode.kind === "order" ? (
          <button className="canvas-btn" onClick={() => onOpenOrder(canvasNode.id.replace(/^order:/, ""))}>打开订单详情 →</button>
        ) : null}
      </aside>
    );
  }
  if (order) {
    return (
      <aside className="inspector">
        <h3>Inspector</h3>
        <p className="mono" style={{ fontWeight: 600 }}>{order.orderId}</p>
        <div style={{ display: "flex", gap: 6, margin: "6px 0 12px" }}>{statusBadge(order.status)}</div>
        <dl className="kv">
          {order.assetType ? (<><dt>assetType</dt><dd>{order.assetType}</dd></>) : null}
          {order.priority ? (<><dt>priority</dt><dd>{order.priority}</dd></>) : null}
          {order.currentVersion ? (<><dt>current</dt><dd>{order.currentVersion}</dd></>) : null}
          {typeof order.resultCount === "number" ? (<><dt>versions</dt><dd>{order.resultCount}</dd></>) : null}
        </dl>
        {order.title ? <p className="dim" style={{ fontSize: 12 }}>{order.title}</p> : null}
        {view.name !== "order" ? (
          <button className="canvas-btn" onClick={() => onOpenOrder(order.orderId)}>打开订单详情 →</button>
        ) : null}
      </aside>
    );
  }
  return (
    <aside className="inspector">
      <h3>Inspector</h3>
      <p className="empty-note">选择订单或画布节点查看 meta / status / references。</p>
    </aside>
  );
}

export default function App() {
  const [view, setViewState] = useState<View>(() => parseHash());
  const [health, setHealth] = useState<Health | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [canvasNode, setCanvasNode] = useState<GraphNode | null>(null);

  const setView = useCallback((next: View) => {
    setViewState(next);
    window.location.hash = viewHash(next);
    if (next.name !== "canvas") setCanvasNode(null);
  }, []);

  useEffect(() => {
    const onHash = () => setViewState(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    getJSON<Health>("/api/health").then(setHealth).catch(() => setHealth(null));
    getJSON<{ orders: OrderSummary[] }>("/api/orders").then((r) => setOrders(r.orders)).catch(() => setOrders([]));
  }, []);

  const projectName = useMemo(() => {
    if (!health?.projectRoot) return "…";
    const parts = health.projectRoot.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? health.projectRoot;
  }, [health]);

  const openOrder = useCallback((orderId: string) => {
    setSelectedOrderId(orderId);
    setView({ name: "order", orderId });
  }, [setView]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.orderId === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const nav = [
    { key: "persona" as const, label: "Persona", on: health?.protocol.persona },
    { key: "analysis" as const, label: "Analysis", on: health?.protocol.analysis },
    { key: "interview" as const, label: "Interview", on: health?.protocol.interview },
  ];

  return (
    <div className="app">
      <header className="brandbar">
        <span className="glyph" aria-hidden />
        <span className="project">{projectName}</span>
        <span className="crumb">.repochan protocol viewer</span>
        {health ? (
          <span className={`health ${health.protocol.exists ? "" : "bad"}`}>
            <span className="dot" />
            {health.protocol.exists ? `protocol ok · ${health.protocol.orderCount} orders` : "protocol missing"}
          </span>
        ) : null}
        <span className="spacer" />
        <button
          className={`canvas-btn ${view.name === "canvas" ? "active" : ""}`}
          onClick={() => setView({ name: "canvas" })}
        >
          ◈ Canvas
        </button>
      </header>

      <div className="shell">
        <nav className="nav">
          <div className="section">
            <div className="section-title">Protocol</div>
            {nav.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${view.name === item.key ? "active" : ""}`}
                onClick={() => setView({ name: item.key })}
              >
                <span className={`tick ${item.on ? "on" : ""}`} />
                {item.label}
              </button>
            ))}
          </div>
          <div className="section">
            <div className="section-title">Assets</div>
            <button className={`nav-item ${view.name === "orders" || view.name === "order" ? "active" : ""}`} onClick={() => setView({ name: "orders" })}>
              Orders <span className="count">{orders.length}</span>
            </button>
            {orders.slice(0, 12).map((order) => (
              <button
                key={order.orderId}
                className={`nav-item ${view.name === "order" && view.orderId === order.orderId ? "active" : ""}`}
                style={{ paddingLeft: 22, fontSize: 12 }}
                onClick={() => openOrder(order.orderId)}
              >
                <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.orderId}</span>
              </button>
            ))}
            {orders.length > 12 ? <div className="dim" style={{ padding: "2px 22px", fontSize: 11 }}>… {orders.length - 12} more</div> : null}
          </div>
          <div className="section">
            <div className="section-title">Catalog</div>
            <div className="nav-item" style={{ cursor: "default", color: "var(--ink-2)" }}>
              Starters <span className="count">{health?.starters.starters.length ?? 0}</span>
            </div>
            <div className="dim" style={{ padding: "0 10px", fontSize: 11 }}>
              只读预览后续阶段开放；当前来源：{health?.starters.source ? `${health.starters.source.kind}` : "未同步"}
            </div>
          </div>
        </nav>

        <main className="stage">
          {view.name === "orders" ? (
            <OrdersView orders={orders} selectedId={selectedOrderId} onOpen={openOrder} onSelect={setSelectedOrderId} />
          ) : null}
          {view.name === "order" ? (
            <OrderDetailView orderId={view.orderId} onBack={() => setView({ name: "orders" })} onOpenOrder={openOrder} />
          ) : null}
          {view.name === "persona" ? <PersonaView /> : null}
          {view.name === "analysis" ? (
            <ArtifactView
              kind="analysis"
              title="Analysis"
              subtitle="仓库确定性扫描 + LLM 增强分析报告"
              emptyTitle="还没有 analysis 报告"
              emptyCue="/repochan-analysis · repochan analysis run"
            />
          ) : null}
          {view.name === "interview" ? (
            <ArtifactView
              kind="interview"
              title="Interview"
              subtitle="访谈报告：8 个维度的结构化问答"
              emptyTitle="还没有 interview 报告"
              emptyCue="/repochan-interviewer（可选步骤）"
            />
          ) : null}
          {view.name === "canvas" ? <CanvasView onSelectNode={setCanvasNode} onOpenOrder={openOrder} /> : null}
        </main>

        <Inspector view={view} order={selectedOrder} canvasNode={canvasNode} onOpenOrder={openOrder} />
      </div>
    </div>
  );
}
