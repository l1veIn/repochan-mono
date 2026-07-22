import React, { useEffect, useState } from "react";
import { getJSON } from "../api";
import { EmptyState, JsonRows } from "../components";

type ArtifactResponse = {
  current: Record<string, unknown> | null;
  versions: Array<{ file: string; generatedAt: string | null }>;
};

export function ArtifactView(props: {
  kind: "analysis" | "interview";
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyCue: string;
}) {
  const [data, setData] = useState<ArtifactResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJSON<ArtifactResponse>(`/api/${props.kind}`).then(setData).catch((e) => setError(String(e)));
  }, [props.kind]);

  if (error) return <EmptyState title={`无法读取 ${props.title}`} hint={error} />;
  if (!data) return <p className="dim">加载中…</p>;
  if (!data.current) {
    return <EmptyState title={props.emptyTitle} cue={props.emptyCue} />;
  }

  const { generatedAt, schemaVersion, provenance, ...body } = data.current;
  return (
    <div>
      <h1 className="page-title">{props.title}</h1>
      <p className="page-sub">
        {props.subtitle}
        {typeof generatedAt === "string" ? <span className="mono" style={{ marginLeft: 10 }}>{generatedAt}</span> : null}
      </p>
      <div style={{ maxWidth: 920 }}>
        {Object.entries(body).map(([key, value]) => (
          <div className="json-section" key={key}>
            <h4>{key}</h4>
            <JsonRows value={value} />
          </div>
        ))}
      </div>
      {data.versions.length > 0 ? (
        <p className="dim" style={{ marginTop: 16 }}>
          历史版本 {data.versions.length} 份，位于 <span className="mono">{`.repochan/${props.kind}/versions/`}</span>
        </p>
      ) : null}
    </div>
  );
}
