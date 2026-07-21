import React, { useEffect } from "react";

export function Badge(props: { text: string; className?: string }) {
  return <span className={`badge ${props.className ?? ""}`}>{props.text}</span>;
}

export function statusBadge(status?: string) {
  if (!status) return null;
  return <Badge text={status} className={`status-${status}`} />;
}

export function EmptyState(props: { title: string; hint?: string; cue?: string }) {
  return (
    <div className="empty">
      <div>{props.title}</div>
      {props.hint ? <div style={{ marginTop: 6, fontSize: 13 }}>{props.hint}</div> : null}
      {props.cue ? <div className="cue">→ {props.cue}</div> : null}
    </div>
  );
}

export type LightboxImage = { url: string; caption?: string };

export function Lightbox(props: { images: LightboxImage[]; index: number; onClose: () => void; onNavigate: (index: number) => void }) {
  const { images, index, onClose, onNavigate } = props;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (event.key === "ArrowRight" && index < images.length - 1) onNavigate(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onNavigate]);
  const image = images[index];
  if (!image) return null;
  return (
    <div className="lightbox" onClick={onClose}>
      {index > 0 ? (
        <button className="navbtn prev" onClick={(e) => { e.stopPropagation(); onNavigate(index - 1); }} aria-label="previous">‹</button>
      ) : null}
      <img src={image.url} alt={image.caption ?? ""} onClick={(e) => e.stopPropagation()} />
      {index < images.length - 1 ? (
        <button className="navbtn next" onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }} aria-label="next">›</button>
      ) : null}
      {image.caption ? <div className="caption">{image.caption}</div> : null}
    </div>
  );
}

/** Render an arbitrary protocol JSON value as readable labeled rows (not a raw JSON wall). */
export function JsonRows(props: { value: unknown; depth?: number }) {
  const { value, depth = 0 } = props;
  if (value === null || value === undefined) return <span className="dim">—</span>;
  if (typeof value === "string") return <span>{value}</span>;
  if (typeof value === "number" || typeof value === "boolean") return <span className="mono">{String(value)}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="dim">(empty)</span>;
    if (value.every((item) => typeof item === "string" || typeof item === "number")) {
      return (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {value.map((item, i) => <li key={i}>{String(item)}</li>)}
        </ul>
      );
    }
    return (
      <div style={{ display: "grid", gap: 8 }}>
        {value.map((item, i) => (
          <div key={i} style={{ borderLeft: "2px solid var(--line)", paddingLeft: 10 }}>
            <JsonRows value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([key]) => !["schemaVersion", "provenance"].includes(key),
    );
    if (entries.length === 0) return <span className="dim">—</span>;
    return (
      <table>
        <tbody>
          {entries.map(([key, val]) => (
            <tr key={key}>
              <td>{key}</td>
              <td><JsonRows value={val} depth={depth + 1} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <span className="mono">{String(value)}</span>;
}
