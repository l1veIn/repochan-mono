import React, { useEffect, useMemo, useState } from "react";
import {
  downloadUrl,
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

function versionImages(version: OrderVersion | undefined): LightboxImage[] {
  if (!version) return [];
  return version.files
    .filter((f) => f.image)
    .map((f) => ({ url: fileUrl(f.path), caption: `${version.versionId} · ${f.name}` }));
}

type LightboxState = { images: LightboxImage[]; index: number };

/** Optional deep-link: #/order/<id>?v=<versionId> preselects a timeline version. */
function hashVersionParam(): string | null {
  const query = window.location.hash.split("?")[1];
  if (!query) return null;
  return new URLSearchParams(query).get("v");
}

export function OrderDetailView(props: { orderId: string; onBack: () => void; onOpenOrder: (orderId: string) => void }) {
  const { orderId, onBack, onOpenOrder } = props;
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [derived, setDerived] = useState<DerivedTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  useEffect(() => {
    setDetail(null);
    setDerived(null);
    setError(null);
    setSelectedVersionId(null);
    getJSON<OrderDetail>(`/api/orders/${encodeURIComponent(orderId)}`)
      .then((d) => {
        setDetail(d);
        const fromHash = hashVersionParam();
        const fallback = d.currentVersion ?? d.versions[0]?.versionId ?? null;
        setSelectedVersionId(
          fromHash && d.versions.some((v) => v.versionId === fromHash) ? fromHash : fallback,
        );
        if (d.derivedAvailable) {
          getJSON<DerivedTimeline>(`/api/orders/${encodeURIComponent(orderId)}/derived`).then(setDerived).catch(() => undefined);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [orderId]);

  const selected = useMemo(() => {
    if (!detail) return undefined;
    return detail.versions.find((v) => v.versionId === selectedVersionId) ?? detail.versions[0];
  }, [detail, selectedVersionId]);

  const openLightbox = (images: LightboxImage[], index: number) => {
    if (images.length > 0) setLightbox({ images, index });
  };

  if (error) return <EmptyState title={`无法读取订单 ${orderId}`} hint={error} cue="repochan order get <id> --json" />;
  if (!detail) return <p className="dim">加载中…</p>;

  const { order } = detail;
  const hero = firstImage(selected);
  const selectedImages = versionImages(selected);

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

      {hero ? (
        <div className="hero">
          <img src={fileUrl(hero.path)} alt={selected?.versionId} onClick={() => openLightbox(selectedImages, 0)} />
        </div>
      ) : null}

      <div className="panel">
        <h4>Version 时间线</h4>
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
                  version.versionId === selected?.versionId ? "selected" : "",
                ].join(" ").trim()}
                onClick={() => setSelectedVersionId(version.versionId)}
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
        {selected ? (
          <dl className="kv" style={{ marginTop: 10 }}>
            <dt>viewing</dt><dd>{selected.versionId}{selected.versionId === detail.currentVersion ? " (current)" : ""}</dd>
            <dt>createdAt</dt><dd>{new Date(selected.createdAt).toLocaleString()}</dd>
            {selected.tool ? (<><dt>tool</dt><dd>{selected.tool}</dd></>) : null}
            <dt>files</dt><dd>{selected.files.map((f) => f.name).join(", ")}</dd>
          </dl>
        ) : null}
        {selected?.promptBrief ? <p className="dim" style={{ margin: "4px 0 0" }}>{selected.promptBrief}</p> : null}
        {selected?.generationPrompt ? (
          <details className="fold" style={{ marginTop: 8 }}>
            <summary>generationPrompt（完整生成提示词）</summary>
            <pre className="prompt">{selected.generationPrompt}</pre>
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
                {derived.entries.map((entry, i) => {
                  const entryImages: LightboxImage[] = entry.artifacts
                    .filter((a) => a.image)
                    .map((a) => ({ url: fileUrl(a.path), caption: `${entry.slot} · ${a.out}` }));
                  return (
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
                        {entry.artifacts.map((artifact, j) => {
                          const imageIndex = entryImages.findIndex((img) => img.url === fileUrl(artifact.path));
                          return (
                            <div className="art" key={j}>
                              {artifact.image ? (
                                <button
                                  className="art-preview"
                                  onClick={() => openLightbox(entryImages, imageIndex)}
                                  title={`${artifact.op} → ${artifact.out}（点击放大）`}
                                >
                                  <img src={fileUrl(artifact.path)} alt={artifact.out} loading="lazy" />
                                </button>
                              ) : (
                                <a
                                  className="art-preview art-file"
                                  href={downloadUrl(artifact.path)}
                                  download={artifact.out.split("/").pop()}
                                  title={`${artifact.op} → ${artifact.out}（下载）`}
                                >
                                  <span className="name" style={{ padding: "24px 4px", textAlign: "center", display: "block" }}>{artifact.out}</span>
                                </a>
                              )}
                              <div className="art-foot">
                                <span className="name">{artifact.out}</span>
                                <a
                                  className="dl"
                                  href={downloadUrl(artifact.path)}
                                  download={artifact.out.split("/").pop()}
                                  title={`下载 ${artifact.out}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  ⬇
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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
              detail.references.map((ref, i) => {
                const refImages: LightboxImage[] = ref.files
                  .filter((f) => f.path)
                  .map((f) => ({ url: fileUrl(f.path!), caption: `${ref.role} · ${f.name}` }));
                const firstPath = ref.files.find((f) => f.path)?.path ?? null;
                return (
                  <div className="ref-row" key={i}>
                    {firstPath ? (
                      <button
                        className="ref-thumb"
                        onClick={() => openLightbox(refImages, 0)}
                        title={`${ref.role} reference（点击放大）`}
                      >
                        <img src={fileUrl(firstPath)} alt={ref.role} />
                      </button>
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
                );
              })
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
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(index) => setLightbox((prev) => (prev ? { ...prev, index } : prev))}
        />
      ) : null}
    </div>
  );
}
