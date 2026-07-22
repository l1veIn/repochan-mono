import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getJSON, type Health, type OrderSummary, type StartersInfo } from "./api";
import { OrdersView } from "./views/OrdersView";
import { OrderDetailView } from "./views/OrderDetailView";
import { PersonaView } from "./views/PersonaView";
import { ArtifactView } from "./views/ArtifactView";
import { CanvasView } from "./views/CanvasView";
import { StartersView } from "./views/StartersView";

type View =
  | { name: "orders" }
  | { name: "order"; orderId: string }
  | { name: "persona" }
  | { name: "analysis" }
  | { name: "interview" }
  | { name: "starters" }
  | { name: "canvas"; nodeId?: string };

function parseHash(): View {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [head, arg] = hash.split("/");
  if (head === "order" && arg) return { name: "order", orderId: decodeURIComponent(arg) };
  if (head === "canvas") return { name: "canvas", nodeId: arg ? decodeURIComponent(arg) : undefined };
  if (head === "persona" || head === "analysis" || head === "interview" || head === "starters") return { name: head };
  return { name: "orders" };
}

function viewHash(view: View): string {
  if (view.name === "order") return `#/order/${encodeURIComponent(view.orderId)}`;
  if (view.name === "canvas" && view.nodeId) return `#/canvas/${encodeURIComponent(view.nodeId)}`;
  return `#/${view.name}`;
}

export default function App() {
  const [view, setViewState] = useState<View>(() => parseHash());
  const [health, setHealth] = useState<Health | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [starters, setStarters] = useState<StartersInfo | null>(null);

  const setView = useCallback((next: View) => {
    setViewState(next);
    window.location.hash = viewHash(next);
  }, []);

  useEffect(() => {
    const onHash = () => setViewState(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    getJSON<Health>("/api/health").then(setHealth).catch(() => setHealth(null));
    getJSON<{ orders: OrderSummary[] }>("/api/orders").then((r) => setOrders(r.orders)).catch(() => setOrders([]));
    getJSON<StartersInfo>("/api/starters").then(setStarters).catch(() => setStarters(null));
  }, []);

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

        <main className="stage">
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
