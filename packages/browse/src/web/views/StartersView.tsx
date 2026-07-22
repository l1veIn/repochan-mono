import React, { useEffect, useState } from "react";
import { getJSON, postJSON, starterFileUrl, type StarterMeta, type StartersInfo } from "../api";
import { Badge, EmptyState } from "../components";

function StarterCard(props: { starter: StarterMeta; onPreview: (starter: StarterMeta) => void; busy: boolean }) {
  const { starter, onPreview, busy } = props;
  const preview = starter.previews?.desktop;
  return (
    <div className="card starter-card">
      <button className="thumb" onClick={() => onPreview(starter)} disabled={busy} title="构建并预览该 starter">
        {preview ? (
          <img src={starterFileUrl(starter.id, preview)} alt={starter.name ?? starter.id} loading="lazy" />
        ) : (
          <span className="noimg">no preview</span>
        )}
      </button>
      <div className="meta">
        <div className="id">{starter.id}</div>
        {starter.name ? <div className="intent">{starter.name}</div> : null}
        {starter.description ? <div className="intent" style={{ WebkitLineClamp: 3 }}>{starter.description}</div> : null}
        <div className="badges">
          {starter.style ? <Badge text={starter.style} /> : null}
          {starter.default ? <Badge text="default" className="foundation" /> : null}
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="canvas-btn" onClick={() => onPreview(starter)} disabled={busy}>
            {busy ? "构建中…" : "▶ Preview"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StartersView(props: {
  onSourceChange: (info: StartersInfo) => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const [info, setInfo] = useState<StartersInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    const next = await getJSON<StartersInfo>("/api/starters");
    setInfo(next);
    props.onSourceChange(next);
  };

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await postJSON<{ result: { version?: string; durationMs?: number } }>("/api/actions/starter-sync");
      setNotice(`已同步 @repochan/starters${result.result?.version ? `@${result.result.version}` : ""}（${Math.round((result.result?.durationMs ?? 0) / 1000)}s）`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  const preview = async (starter: StarterMeta) => {
    setPreviewingId(starter.id);
    setError(null);
    setNotice(null);
    try {
      const result = await postJSON<{ url: string; reused: boolean }>("/api/actions/starter-preview", { id: starter.id });
      setNotice(result.reused ? `${starter.id}：使用已缓存的构建。` : `${starter.id}：构建完成。`);
      window.open(result.url, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewingId(null);
    }
  };

  if (error && !info) return <EmptyState title="无法读取 starters" hint={error} />;
  if (!info) return <p className="dim">加载中…</p>;

  if (!info.source) {
    return (
      <div>
        <h1 className="page-title">Starters</h1>
        <p className="page-sub">整站 scaffold 目录 — pull 本地化或在线预览</p>
        <div className="empty">
          <div>还没有 starters 来源</div>
          <div style={{ marginTop: 6, fontSize: 13 }}>
            starter 解析顺序：<span className="mono">--from → REPOCHAN_STARTERS_DIR → ~/.repochan/starters 缓存 → bundled</span>，当前全部缺失。
          </div>
          <div style={{ marginTop: 18 }}>
            <button className="canvas-btn" onClick={sync} disabled={syncing}>
              {syncing ? "同步中…（下载 @repochan/starters）" : "↓ Sync starters"}
            </button>
          </div>
          <div className="cue">等价于 repochan starter sync</div>
        </div>
        {error ? <p className="err" style={{ color: "var(--danger)", marginTop: 12 }}>{error}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Starters</h1>
      <p className="page-sub">
        {info.starters.length} 个 starter · 来源 <span className="mono">{info.source.kind}</span>
        {info.source.version ? <span className="mono">@{info.source.version}</span> : null}
        {" · "}点击卡片构建并在新标签页预览
      </p>
      {notice ? <p className="dim" style={{ marginTop: -8 }}>{notice}</p> : null}
      {error ? <p style={{ color: "var(--danger)", marginTop: -8 }}>{error}</p> : null}
      {info.starters.length === 0 ? (
        <EmptyState title="来源目录为空" hint="starter sync 下载的缓存里没有有效 starter。" cue="repochan starter list --json" />
      ) : (
        <div className="grid">
          {info.starters.map((starter) => (
            <StarterCard key={starter.id} starter={starter} onPreview={preview} busy={previewingId === starter.id} />
          ))}
        </div>
      )}
    </div>
  );
}
