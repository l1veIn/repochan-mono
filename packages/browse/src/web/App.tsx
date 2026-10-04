import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getJSON, type Health, type OrderSummary, type StartersInfo } from "./api";
import { OrdersView } from "./views/OrdersView";
import { OrderDetailView } from "./views/OrderDetailView";
import { PersonaView } from "./views/PersonaView";
import { ArtifactView } from "./views/ArtifactView";
import { CanvasView } from "./views/CanvasView";
import { StartersView } from "./views/StartersView";
import { parseHash, viewHash, type View } from "./routing";

export default function App() {
  const [view, setViewState] = useState<View>(() => parseHash(window.location.hash));
  const [health, setHealth] = useState<Health | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [starters, setStarters] = useState<StartersInfo | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const setView = useCallback((next: View) => {
    setViewState(next);
    window.location.hash = viewHash(next);
  }, []);

  useEffect(() => {
    const onHash = () => setViewState(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    const results = await Promise.allSettled([
      getJSON<Health>("/api/health").then(setHealth),
      getJSON<{ orders: OrderSummary[] }>("/api/orders").then((r) => setOrders(r.orders)),
      getJSON<StartersInfo>("/api/starters").then(setStarters),
    ]);
    if (results.some((result) => result.status === "rejected")) {
      setRefreshError("Some data could not be refreshed. Try Refresh again.");
    }
    // Reload the current detail/artifact/canvas view as well as navigation counts.
    setRefreshRevision((revision) => revision + 1);
    setRefreshing(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const projectName = useMemo(() => {
    if (!health?.projectRoot) return "…";
    const parts = health.projectRoot.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? health.projectRoot;
  }, [health]);

  const openOrder = useCallback((orderId: string) => {
    setView({ name: "order", orderId });
  }, [setView]);

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
        <button className="canvas-btn" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "↻ Refresh"}
        </button>
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
            <button
              className={`nav-item ${view.name === "orders" || view.name === "order" ? "active" : ""}`}
              onClick={() => setView({ name: "orders" })}
            >
              Orders <span className="count">{orders.length}</span>
            </button>
          </div>
          <div className="section">
            <div className="section-title">Catalog</div>
            <button
              className={`nav-item ${view.name === "starters" ? "active" : ""}`}
              onClick={() => setView({ name: "starters" })}
            >
              Starters <span className="count">{starters?.starters.length ?? 0}</span>
            </button>
            <div className="dim" style={{ padding: "0 10px", fontSize: 11 }}>
              来源：{starters?.source ? starters.source.kind : "未同步"}
            </div>
          </div>
        </nav>

        <main className="stage" key={refreshRevision}>
          {refreshError ? <div role="alert" className="dim">{refreshError}</div> : null}
          {view.name === "orders" ? <OrdersView orders={orders} onOpen={openOrder} /> : null}
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
          {view.name === "starters" ? (
            <StartersView
              onSourceChange={(info) => setStarters(info)}
              onOpenOrder={openOrder}
            />
          ) : null}
          {view.name === "canvas" ? <CanvasView initialNodeId={view.nodeId} onOpenOrder={openOrder} /> : null}
        </main>
      </div>
    </div>
  );
}
