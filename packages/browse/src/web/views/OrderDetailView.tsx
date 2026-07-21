import React, { useEffect, useMemo, useState } from "react";
import {
  fileUrl,
  getJSON,
  type DerivedTimeline,
  type OrderDetail,
  type OrderVersion,
} from "../api";
import { Badge, EmptyState, Lightbox, statusBadge, type LightboxImage } from "../components";

function firstImage(version: OrderVersion | undefined) {
  return version?.files.find((f) => f.image);
}

function allImages(versions: OrderVersion[]): LightboxImage[] {
  return versions.flatMap((v) =>
    v.files.filter((f) => f.image).map((f) => ({ url: fileUrl(f.path), caption: `${v.versionId} · ${f.name}` })),
  );
}

export function OrderDetailView(props: { orderId: string; onBack: () => void; onOpenOrder: (orderId: string) => void }) {
  const { orderId, onBack, onOpenOrder } = props;
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [derived, setDerived] = useState<DerivedTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ a?: string; b?: string }>({});
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    setDetail(null);
    setDerived(null);
    setError(null);
    setPicked({});
    getJSON<OrderDetail>(`/api/orders/${encodeURIComponent(orderId)}`)
      .then((d) => {
        setDetail(d);
        if (d.derivedAvailable) {
          getJSON<DerivedTimeline>(`/api/orders/${encodeURIComponent(orderId)}/derived`).then(setDerived).catch(() => undefined);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [orderId]);

  const images = useMemo(() => (detail ? allImages(detail.versions) : []), [detail]);

  if (error) return <EmptyState title={`无法读取订单 ${orderId}`} hint={error} cue="repochan order get <id> --json" />;
  if (!detail) return <p className="dim">加载中…</p>;

  const { order } = detail;
  const current = detail.versions.find((v) => v.versionId === detail.currentVersion) ?? detail.versions[0];
  const hero = firstImage(current);
  const pickA = detail.versions.find((v) => v.versionId === picked.a);
  const pickB = detail.versions.find((v) => v.versionId === picked.b);
  const compareMode = Boolean(pickA && pickB);

  const togglePick = (versionId: string) => {
    setPicked((prev) => {
      if (prev.a === versionId) return { ...prev, a: undefined };
      if (prev.b === versionId) return { ...prev, b: undefined };
      if (!prev.a) return { ...prev, a: versionId };
      if (!prev.b) return { ...prev, b: versionId };
      return { a: prev.b, b: versionId };
    });
  };

  const openLightbox = (path: string) => {
    const idx = images.findIndex((img) => img.url === fileUrl(path));
    if (idx >= 0) setLightbox(idx);
  };

  return (
    <div>
      <div className="detail-head">
        <button className="canvas-btn" onClick={onBack}>← Orders</button>
        <h2>{order.orderId}</h2>
        {statusBadge(order.status)}
        <Badge text={order.assetType} />
        <Badge text={order.priority} />
        {order.templateId ? <span className="mono dim">{order.templateId}</span> : null}
      </div>

      {hero && !compareMode ? (
        <div className="hero">
          <img src={fileUrl(hero.path)} alt={current?.versionId} onClick={() => openLightbox(hero.path)} />
        </div>
      ) : null}

      {compareMode && pickA && pickB ? (
        <div className="compare" style={{ marginBottom: 16 }}>
          {[pickA, pickB].map((version, i) => {
            const img = firstImage(version);
            return (
              <figure key={version.versionId}>
                {img ? <img src={fileUrl(img.path)} alt={version.versionId} onClick={() => openLightbox(img.path)} /> : null}
                <figcaption>{i === 0 ? "A" : "B"} · {version.versionId} · {new Date(version.createdAt).toLocaleString()}</figcaption>
              </figure>
            );
          })}
        </div>
      ) : null}

      <div className="panel">
        <h4>Version 时间线{detail.versions.length > 1 ? "（点选两版可 A/B 对比）" : ""}</h4>
        {detail.versions.length === 0 ? (
          <p className="dim">尚无 result version —— Painter 交付后出现在这里。</p>
        ) : (
          <div className="version-rail">
            {detail.versions.map((version) => (
              <button
                key={version.versionId}
                className={[
                  "version-chip",
                  version.versionId === detail.currentVersion ? "current" : "",
                  picked.a === version.versionId ? "picked-a" : "",
                  picked.b === version.versionId ? "picked-b" : "",
                ].join(" ").trim()}
                onClick={() => togglePick(version.versionId)}
                title={version.promptBrief ?? version.versionId}
              >
                {version.versionId}
                {version.versionId === detail.currentVersion ? " ●" : ""}
                {detail.candidateVersions.includes(version.versionId) ? " ○" : ""}
                <span className="when">{new Date(version.createdAt).toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}
        {current?.promptBrief ? <p className="dim" style={{ margin: "4px 0 0" }}>{current.promptBrief}</p> : null}
        {current?.generationPrompt ? (
          <details className="fold" style={{ marginTop: 8 }}>
            <summary>generationPrompt（完整生成提示词）</summary>
            <pre className="prompt">{current.generationPrompt}</pre>
          </details>
        ) : null}
      </div>

      <div className="detail-grid">
        <div>
          <div className="panel">
            <h4>Brief</h4>
            {order.brief?.intent ? <p>{order.brief.intent}</p> : <p className="dim">无 brief。</p>}
            {order.brief?.mustInclude?.length ? (
              <>
                <h4 style={{ marginTop: 12 }}>Must include</h4>
                <ul>{order.brief.mustInclude.map((item, i) => <li key={i}>{item}</li>)}</ul>
              </>
            ) : null}
            {order.brief?.avoid?.length ? (
              <>
                <h4 style={{ marginTop: 12 }}>Avoid</h4>
                <ul>{order.brief.avoid.map((item, i) => <li key={i}>{item}</li>)}</ul>
              </>
            ) : null}
          </div>

          <div className="panel">
            <h4>Derived 审计（asset-apply 归档）</h4>
            {!derived ? (
              <p className="dim">无 derived 记录 —— 该订单尚未被 <span className="mono">repochan starter asset-apply</span> 应用。</p>
            ) : (
              <div className="timeline">
                {derived.entries.map((entry, i) => (
                  <div className="tl-entry" key={i}>
                    <div className="head">
                      <span className="slot">{entry.slot}</span>
                      <Badge text={entry.starter} />
                      <span className="mono dim">{entry.resultVersion}</span>
                      <span className="dim">{new Date(entry.appliedAt).toLocaleString()}</span>
                      <span className="dim">· {entry.artifactCount} artifacts</span>
                    </div>
                    <div className="mono dim" style={{ fontSize: 11, marginTop: 2 }}>
                      {entry.steps.map((s) => `${s.op}→${s.out}${s.keep ? "" : " (dropped)"}`).join(" · ")}
                    </div>
                    <div className="tl-artifacts">
                      {entry.artifacts.map((artifact, j) =>
                        artifact.image ? (
                          <button className="art" key={j} onClick={() => openLightbox(artifact.path)} title={`${artifact.op} → ${artifact.out}`}>
                            <img src={fileUrl(artifact.path)} alt={artifact.out} loading="lazy" />
                            <div className="name">{artifact.out}</div>
                          </button>
                        ) : (
                          <a className="art" key={j} href={fileUrl(artifact.path)} target="_blank" rel="noreferrer" title={`${artifact.op} → ${artifact.out}`}>
                            <div className="name" style={{ padding: "28px 4px", textAlign: "center" }}>{artifact.out}</div>
                          </a>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <h4>Meta</h4>
            <dl className="kv">
              <dt>requestType</dt><dd>{order.requestType}</dd>
              <dt>createdAt</dt><dd>{new Date(order.createdAt).toLocaleString()}</dd>
              <dt>updatedAt</dt><dd>{new Date(order.updatedAt).toLocaleString()}</dd>
              <dt>current</dt><dd>{detail.currentVersion ?? "—"}</dd>
              <dt>candidates</dt><dd>{detail.candidateVersions.length ? detail.candidateVersions.join(", ") : "—"}</dd>
            </dl>
            {order.deliverables?.length ? (
              <>
                <h4 style={{ marginTop: 10 }}>Deliverables</h4>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {order.deliverables.map((d, i) => (
                    <li key={i}><span className="mono">{d.name}</span> <span className="dim">{d.format}{d.width ? ` · ${d.width}×${d.height ?? "?"}` : ""}</span></li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>

          <div className="panel">
            <h4>References</h4>
            {detail.references.length === 0 ? (
              <p className="dim">无 references —— 独立资产，不锚定其他订单。</p>
            ) : (
              detail.references.map((ref, i) => (
                <div className="ref-row" key={i}>
                  {ref.files.find((f) => f.path) ? (
                    <img src={fileUrl(ref.files.find((f) => f.path)!.path!)} alt={ref.role} />
                  ) : (
                    <span style={{ width: 44 }} />
                  )}
                  <div>
                    <div>
                      <Badge text={ref.role} />{" "}
                      {ref.type === "order" ? (
                        <a
                          href="#"
                          onClick={(e) => { e.preventDefault(); if (ref.orderId) onOpenOrder(ref.orderId); }}
                          className="mono"
                        >
                          {ref.orderId}{ref.versionId ? `@${ref.versionId}` : ""}
                        </a>
                      ) : (
                        <span className="mono">{ref.path}</span>
                      )}
                    </div>
                    {ref.error ? <div className="err">⚠ {ref.error}</div> : null}
                  </div>
                </div>
              ))
            )}
          </div>

          {order.acceptanceCriteria?.length ? (
            <div className="panel">
              <h4>Acceptance</h4>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {order.acceptanceCriteria.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {lightbox !== null ? (
        <Lightbox images={images} index={lightbox} onClose={() => setLightbox(null)} onNavigate={setLightbox} />
      ) : null}
    </div>
  );
}
