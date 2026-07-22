import React, { useMemo, useState } from "react";
import { fileUrl, type OrderSummary } from "../api";
import { Badge, EmptyState, statusBadge } from "../components";

export function OrdersView(props: {
  orders: OrderSummary[];
  onOpen: (orderId: string) => void;
}) {
  const { orders, onOpen } = props;
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [query, setQuery] = useState("");

  const statuses = useMemo(() => [...new Set(orders.map((o) => o.status).filter(Boolean))] as string[], [orders]);
  const types = useMemo(() => [...new Set(orders.map((o) => o.assetType).filter(Boolean))] as string[], [orders]);
  const filtered = orders.filter((order) => {
    if (statusFilter && order.status !== statusFilter) return false;
    if (typeFilter && order.assetType !== typeFilter) return false;
    if (query && !`${order.orderId} ${order.title ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  if (orders.length === 0) {
    return (
      <EmptyState
        title="还没有任何 Asset Order"
        hint="订单由美术总监技能创建：先完成 analysis 与 persona，再约稿 foundation。"
        cue="repochan-analysis → repochan-persona → repochan-art-director"
      />
    );
  }

  return (
    <div>
      <h1 className="page-title">Orders</h1>
      <p className="page-sub">{orders.length} 个创作订单 · 封面取 current version 主图</p>
      <div className="filters">
        <input placeholder="搜索 order id / intent…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">全部 status</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">全部 assetType</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="没有匹配筛选条件的订单" hint="调整筛选或搜索词。" />
      ) : (
        <div className="grid">
          {filtered.map((order) => (
            <button
              key={order.orderId}
              className="card"
              onClick={() => onOpen(order.orderId)}
            >
              <div className="thumb">
                {order.cover ? (
                  <img src={fileUrl(order.cover)} alt={order.orderId} loading="lazy" />
                ) : (
                  <span className="noimg">{order.unreadable ? "unreadable" : "no result yet"}</span>
                )}
              </div>
              <div className="meta">
                <div className="id">{order.orderId}</div>
                {order.title ? <div className="intent">{order.title}</div> : null}
                <div className="badges">
                  {statusBadge(order.status)}
                  {order.assetType ? <Badge text={order.assetType} /> : null}
                  {order.currentVersion ? <Badge text={order.currentVersion} /> : null}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
