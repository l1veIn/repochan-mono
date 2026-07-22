import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, Handle, Position, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import { fileUrl, getJSON, type Graph, type GraphNode } from "../api";
import { EmptyState, statusBadge, Badge } from "../components";

type ProtocolNodeData = {
  graphNode: GraphNode;
  selected: boolean;
  [key: string]: unknown;
};
type ProtocolFlowNode = Node<ProtocolNodeData, "protocol">;

const NODE_SIZES: Record<GraphNode["kind"], { width: number; height: number }> = {
  order: { width: 168, height: 136 },
  derived: { width: 168, height: 78 },
  persona: { width: 140, height: 68 },
  analysis: { width: 140, height: 68 },
  interview: { width: 140, height: 68 },
};

function ProtocolNode({ data }: NodeProps<ProtocolFlowNode>) {
  const node = data.graphNode;
  const classNames = ["rf-node", node.foundation ? "foundation" : "", data.selected ? "selected" : "", node.kind !== "order" ? "doc" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classNames}>
      <Handle type="target" position={Position.Left} />
      {node.thumb ? <img src={fileUrl(node.thumb)} alt={node.label} /> : null}
      <div className="nkind">
        {node.kind}{node.foundation ? " · foundation" : ""}{node.assetType ? ` · ${node.assetType}` : ""}
      </div>
      <div className="nlabel">{node.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { protocol: ProtocolNode };

function layoutGraph(graph: Graph): { nodes: ProtocolFlowNode[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 80, marginx: 24, marginy: 24 });

  for (const node of graph.nodes) {
    const size = NODE_SIZES[node.kind] ?? NODE_SIZES.order;
    dagreGraph.setNode(node.id, { width: size.width, height: size.height });
  }
  for (const edge of graph.edges) {
    if (dagreGraph.hasNode(edge.from) && dagreGraph.hasNode(edge.to)) dagreGraph.setEdge(edge.from, edge.to);
  }
  dagre.layout(dagreGraph);

  const nodes: ProtocolFlowNode[] = graph.nodes.map((node) => {
    const size = NODE_SIZES[node.kind] ?? NODE_SIZES.order;
    const position = dagreGraph.node(node.id);
    return {
      id: node.id,
      type: "protocol",
      position: { x: (position?.x ?? 0) - size.width / 2, y: (position?.y ?? 0) - size.height / 2 },
      data: { graphNode: node, selected: false },
    };
  });

  const edges: Edge[] = graph.edges.map((edge, i) => ({
    id: `e${i}-${edge.from}-${edge.to}`,
    source: edge.from,
    target: edge.to,
    label: edge.role,
    animated: edge.kind === "foundation-anchor",
    style: {
      stroke: edge.kind === "foundation-anchor" ? "#38bdf8" : edge.kind === "derived-from" ? "#a78bfa" : "#9aa2ad",
      strokeWidth: edge.kind === "foundation-anchor" ? 2.4 : 1.4,
      strokeDasharray: edge.kind === "derived-from" ? "6 4" : undefined,
    },
    labelStyle: { fontSize: 10, fill: "#9aa2ad" },
  }));

  return { nodes, edges };
}

function NodeInspector(props: { node: GraphNode; onOpenOrder: (orderId: string) => void; onClose: () => void }) {
  const { node, onOpenOrder, onClose } = props;
  return (
    <aside className="canvas-inspector">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3>Inspector</h3>
        <button className="canvas-btn" style={{ padding: "2px 10px" }} onClick={onClose} aria-label="close">×</button>
      </div>
      {node.thumb ? <img className="ci-thumb" src={fileUrl(node.thumb)} alt={node.label} /> : null}
      <p className="mono" style={{ fontWeight: 600, margin: "10px 0 4px" }}>{node.label}</p>
      <div style={{ display: "flex", gap: 6, margin: "4px 0 10px", flexWrap: "wrap" }}>
        <Badge text={node.kind} />
        {statusBadge(node.status)}
        {node.foundation ? <Badge text="foundation" className="foundation" /> : null}
      </div>
      <dl className="kv">
        <dt>node</dt><dd>{node.id}</dd>
        {node.assetType ? (<><dt>assetType</dt><dd>{node.assetType}</dd></>) : null}
        {node.foundation ? (<><dt>role</dt><dd>foundation anchor — 全部下游 references 的视觉真相来源</dd></>) : null}
      </dl>
      {node.kind === "order" ? (
        <button className="canvas-btn" onClick={() => onOpenOrder(node.id.replace(/^order:/, ""))}>打开订单详情 →</button>
      ) : null}
      {node.kind === "derived" ? (
        <button className="canvas-btn" onClick={() => onOpenOrder(node.id.replace(/^derived:/, ""))}>查看 derived 审计 →</button>
      ) : null}
    </aside>
  );
}

export function CanvasView(props: { initialNodeId?: string; onOpenOrder: (orderId: string) => void }) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(props.initialNodeId ?? null);

  useEffect(() => {
    getJSON<Graph>("/api/graph").then(setGraph).catch((e) => setError(String(e)));
  }, []);

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as ProtocolFlowNode[], edges: [] as Edge[] };
    const laidOut = layoutGraph(graph);
    laidOut.nodes = laidOut.nodes.map((node) => ({
      ...node,
      data: { ...node.data, selected: node.id === selectedId },
    }));
    return laidOut;
  }, [graph, selectedId]);

  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.id === selectedId) ?? null,
    [graph, selectedId],
  );

  const onNodeClick = useCallback((_: unknown, node: ProtocolFlowNode) => {
    setSelectedId(node.id);
  }, []);

  const onNodeDoubleClick = useCallback(
    (_: unknown, node: ProtocolFlowNode) => {
      if (node.data.graphNode.kind === "order") props.onOpenOrder(node.data.graphNode.id.replace(/^order:/, ""));
    },
    [props],
  );

  if (error) return <EmptyState title="无法构建依赖图" hint={error} />;
  if (!graph) return <p className="dim">加载中…</p>;

  if (graph.edges.length === 0) {
    return (
      <EmptyState
        title="画布上还没有依赖关系"
        hint="建立 reference 或 foundation 后，依赖会自动出现在这里。"
        cue="repochan-art-director 创建 foundation + 下游订单 references"
      />
    );
  }

  return (
    <div className={`canvas-layout ${selectedNode ? "with-inspector" : ""}`}>
      <div className="canvas-wrap">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={() => setSelectedId(null)}
          fitView
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          deleteKeyCode={null}
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {selectedNode ? (
        <NodeInspector node={selectedNode} onOpenOrder={props.onOpenOrder} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}
