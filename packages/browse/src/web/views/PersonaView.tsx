import React, { useEffect, useState } from "react";
import { getJSON, type PersonaResponse } from "../api";
import { EmptyState, JsonRows } from "../components";

/** Fields promoted to the structured card header; everything else falls through to generic sections. */
const HEADER_FIELDS = new Set(["name", "nameZh", "occupation", "schemaVersion", "generatedAt", "provenance"]);

function PersonaCard(props: { persona: Record<string, unknown>; subtitle?: string }) {
  const { persona, subtitle } = props;
  const name = typeof persona.name === "string" ? persona.name : undefined;
  const nameZh = typeof persona.nameZh === "string" ? persona.nameZh : undefined;
  const occupation = typeof persona.occupation === "string" ? persona.occupation : undefined;
  const rest = Object.entries(persona).filter(([key]) => !HEADER_FIELDS.has(key));
  return (
    <div className="persona-card">
      <h2>
        {name ?? "(unnamed persona)"}
        {nameZh ? <span className="zh">{nameZh}</span> : null}
      </h2>
      <div className="occupation">
        {occupation ?? ""}
        {subtitle ? <span className="mono" style={{ marginLeft: 8, fontSize: 11 }}>{subtitle}</span> : null}
      </div>
      {rest.map(([key, value]) => (
        <section className="persona-section" key={key}>
          <h4>{key}</h4>
          <JsonRows value={value} />
        </section>
      ))}
    </div>
  );
}

export function PersonaView() {
  const [data, setData] = useState<PersonaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ kind: "current" } | { kind: "version"; file: string } | { kind: "candidate"; slug: string }>({ kind: "current" });
  const [override, setOverride] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    getJSON<PersonaResponse>("/api/persona").then(setData).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    setOverride(null);
    if (viewing.kind === "current") return;
    const path = viewing.kind === "version"
      ? `persona/versions/${viewing.file}`
      : `persona/candidates/${viewing.slug}.json`;
    getJSON<Record<string, unknown>>(`/api/file?path=${encodeURIComponent(path)}`).then(setOverride).catch(() => setOverride(null));
  }, [viewing]);

  if (error) return <EmptyState title="无法读取 persona" hint={error} />;
  if (!data) return <p className="dim">加载中…</p>;

  if (!data.current && data.candidates.length === 0) {
    return (
      <EmptyState
        title="还没有 persona"
        hint="人设由 persona 技能从 analysis（与可选访谈）生成。"
        cue="/repochan-persona · repochan persona create"
      />
    );
  }

  const shown = viewing.kind === "current" ? data.current : override;
  const subtitle =
    viewing.kind === "version" ? `version · ${viewing.file}` :
    viewing.kind === "candidate" ? `candidate · ${viewing.slug}` :
    typeof data.current?.generatedAt === "string" ? `current · ${data.current.generatedAt}` : undefined;

  return (
    <div>
      <h1 className="page-title">Persona</h1>
      <p className="page-sub">结构化人设卡 · versions 与 candidates 可切换对照</p>
      <div className="detail-grid">
        <div>
          {shown ? <PersonaCard persona={shown} subtitle={subtitle} /> : <p className="dim">加载版本…</p>}
        </div>
        <div>
          <div className="panel">
            <h4>Current</h4>
            <button className={`nav-item ${viewing.kind === "current" ? "active" : ""}`} onClick={() => setViewing({ kind: "current" })}>
              current.json {data.current?.generatedAt ? <span className="count">{String(data.current.generatedAt).slice(0, 10)}</span> : null}
            </button>
          </div>
          <div className="panel">
            <h4>Versions（{data.versions.length}）</h4>
            {data.versions.length === 0 ? <p className="dim">暂无历史版本。</p> : null}
            {data.versions.map((v) => (
              <button
                key={v.file}
                className={`nav-item ${viewing.kind === "version" && viewing.file === v.file ? "active" : ""}`}
                onClick={() => setViewing({ kind: "version", file: v.file })}
              >
                {v.file.replace(/\.json$/, "")}
              </button>
            ))}
          </div>
          <div className="panel">
            <h4>Candidates（{data.candidates.length}）</h4>
            {data.candidates.length === 0 ? <p className="dim">暂无候选。repochan persona candidate create 可创建。</p> : null}
            {data.candidates.map((c) => (
              <button
                key={c.slug}
                className={`nav-item ${viewing.kind === "candidate" && viewing.slug === c.slug ? "active" : ""}`}
                onClick={() => setViewing({ kind: "candidate", slug: c.slug })}
              >
                {c.slug} {c.name ? <span className="dim">· {c.name}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
