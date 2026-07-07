import { useRef, useState, useCallback, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import ForceGraph3D from 'react-force-graph-3d';

export interface GraphNode {
  id: string;
  name: string;
  version: string;
  scope?: string;
  isDirect?: boolean;
  isRoot?: boolean;
  cveSeverity?: string;
  cveIds?: string[];
  healthScore?: number;
  healthLabel?: string;
  x?: number; y?: number; z?: number;
  vx?: number; vy?: number; vz?: number;
  fx?: number; fy?: number; fz?: number;
}

export interface GraphLink { source: string; target: string; type?: string; }
interface GraphData { nodes: GraphNode[]; links: GraphLink[]; }
interface DependencyGraphProps { projectName: string; onNodeClick: (node: GraphNode) => void; }

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ff4444', high: '#ff8800', medium: '#eab308', low: '#3b82f6',
};
const HEALTH_COLORS: Record<string, string> = {
  healthy: '#22c55e', watch: '#eab308', caution: '#f97316', risky: '#ef4444',
};

function nodeColor(node: GraphNode): string {
  if (node.isRoot) return '#a78bfa';
  if (node.cveSeverity) return SEVERITY_COLORS[node.cveSeverity] ?? '#888';
  if (node.healthLabel) return HEALTH_COLORS[node.healthLabel] ?? '#888';
  return node.isDirect ? '#4f8ef7' : '#374151';
}

function nodeSize(node: GraphNode): number {
  if (node.isRoot) return 12;
  if (node.isDirect) return 6;
  return 3.5;
}

export function DependencyGraph({ projectName, onNodeClick }: DependencyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef        = useRef<any>(null);
  const pinnedRef    = useRef(false);

  const [graphData,   setGraphData]   = useState<GraphData>({ nodes: [], links: [] });
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [mousePos,    setMousePos]    = useState({ x: 0, y: 0 });
  const [containerW,  setContainerW]  = useState(800);
  const [containerH,  setContainerH]  = useState(600);
  const [filter,      setFilter]      = useState({ showDev: true, showVulnOnly: false, search: '' });
  const [viewMode,    setViewMode]    = useState<'2d' | '3d'>('3d');

  // ── Fetch graph data ───────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true); setError(null); pinnedRef.current = false;
    fetch(`/api/graph/${encodeURIComponent(projectName)}`)
      .then(r => { if (!r.ok) throw new Error(`API error ${r.status}`); return r.json(); })
      .then((d: GraphData) => setGraphData(d))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectName]);

  // ── Measure container (fires after layout) ─────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w > 0 && h > 0) { setContainerW(w); setContainerH(h); }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Also measure after a tick in case layout isn't done
    const t = setTimeout(measure, 100);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, []);

  // ── Configure forces once graph loaded ─────────────────────────────────────
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || graphData.nodes.length === 0) return;
    pinnedRef.current = false;

    const t = setTimeout(() => {
      if (viewMode === '3d') {
        const ctrl = fg.controls?.();
        if (ctrl) {
          ctrl.autoRotate      = false;   // NO auto-rotation ever
          ctrl.autoRotateSpeed = 0;
          ctrl.enableDamping   = true;
          ctrl.dampingFactor   = 0.1;
          ctrl.rotateSpeed     = 1.2;
          ctrl.zoomSpeed       = 3.0;
          ctrl.panSpeed        = 1.0;
        }
      }
      // Force settings — spread nodes out nicely
      if (fg.d3Force) {
        fg.d3Force('charge')?.strength(viewMode === '3d' ? -220 : -180);
        fg.d3Force('link')?.distance(viewMode === '3d' ? 65 : 50);
        fg.d3VelocityDecay(0.5);
        fg.d3ReheatSimulation();
      }
    }, 100);
    return () => clearTimeout(t);
  }, [graphData, viewMode]);

  // ── After simulation settles, pin all nodes to stop movement ──────────────
  const handleEngineStop = useCallback(() => {
    if (pinnedRef.current) return;
    const fg = fgRef.current;
    if (!fg) return;

    const nodes: GraphNode[] = fg.graphData?.()?.nodes ?? [];

    // Only pin if nodes have actually spread out (not all at 0,0)
    const spread = nodes.some(n => Math.abs(n.x ?? 0) > 5 || Math.abs(n.y ?? 0) > 5);
    if (!spread) return; // simulation hasn't run yet, don't pin

    pinnedRef.current = true;
    for (const n of nodes) {
      n.fx = n.x ?? 0;
      n.fy = n.y ?? 0;
      if (viewMode === '3d') n.fz = n.z ?? 0;
    }
  }, [viewMode]);

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filteredData = useCallback((): GraphData => {
    let nodes = graphData.nodes;
    if (!filter.showDev)     nodes = nodes.filter(n => n.scope !== 'development');
    if (filter.showVulnOnly) nodes = nodes.filter(n => !!n.cveSeverity || !!n.isRoot);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      nodes = nodes.filter(n => n.name?.toLowerCase().includes(q) || !!n.isRoot);
    }
    const ids   = new Set(nodes.map(n => n.id));
    const links = graphData.links.filter(l =>
      ids.has(typeof l.source === 'object' ? (l.source as GraphNode).id : l.source) &&
      ids.has(typeof l.target === 'object' ? (l.target as GraphNode).id : l.target),
    );
    return { nodes, links };
  }, [graphData, filter]);

  // ── Switch view mode (unpin so layout re-runs in new mode) ────────────────
  const switchView = (mode: '2d' | '3d') => {
    const nodes: GraphNode[] = fgRef.current?.graphData?.()?.nodes ?? [];
    for (const n of nodes) { delete n.fx; delete n.fy; delete n.fz; }
    pinnedRef.current = false;
    setViewMode(mode);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', flexDirection: 'column', gap: '1rem', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '2.5rem', animation: 'spin 1.5s linear infinite' }}>⚡</div>
      <div style={{ fontSize: '0.9rem' }}>Loading dependency graph…</div>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ fontSize: '2rem' }}>⚠️</div>
      <div style={{ color: 'var(--accent-red)', fontWeight: 600 }}>Failed to load graph</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 360, textAlign: 'center' }}>{error}</div>
    </div>
  );

  const data = filteredData();

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
      onMouseMove={e => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
    >
      {/* ── Controls ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        background: 'linear-gradient(180deg,rgba(4,7,13,0.95) 0%,rgba(4,7,13,0.5) 78%,transparent 100%)',
        padding: '10px 14px 24px',
        display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <input type="text" placeholder="🔍 Search packages…" value={filter.search}
          onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
          style={{
            background: 'rgba(12,18,32,0.92)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', borderRadius: 8, padding: '5px 11px',
            fontSize: '0.82rem', width: 185, outline: 'none',
            backdropFilter: 'blur(8px)', fontFamily: 'var(--font-sans)',
          }}
        />

        <div style={{ display: 'flex', background: 'rgba(12,18,32,0.92)',
          border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
          {(['2d', '3d'] as const).map(m => (
            <button key={m} onClick={() => switchView(m)} style={{
              background: viewMode === m ? 'var(--accent-blue)' : 'transparent',
              color: viewMode === m ? '#fff' : 'var(--text-muted)',
              border: 'none', borderRadius: 6, padding: '4px 12px',
              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
            }}>{m.toUpperCase()} Graph</button>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem',
          color: 'var(--text-muted)', cursor: 'pointer', background: 'rgba(12,18,32,0.92)',
          border: '1px solid var(--border)', borderRadius: 6, padding: '4px 9px' }}>
          <input type="checkbox" checked={filter.showDev}
            onChange={e => setFilter(f => ({ ...f, showDev: e.target.checked }))} />
          Dev
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem',
          color: 'var(--text-muted)', cursor: 'pointer', background: 'rgba(12,18,32,0.92)',
          border: '1px solid var(--border)', borderRadius: 6, padding: '4px 9px' }}>
          <input type="checkbox" checked={filter.showVulnOnly}
            onChange={e => setFilter(f => ({ ...f, showVulnOnly: e.target.checked }))} />
          Vulns only
        </label>

        <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)',
          background: 'rgba(12,18,32,0.92)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '4px 9px' }}>
          {data.nodes.length} nodes · {data.links.length} edges
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {[{ color: '#a78bfa', label: 'Root' }, { color: '#4f8ef7', label: 'Direct' },
            { color: '#556070', label: 'Transitive' }, { color: '#f87171', label: 'Vulnerable' }]
            .map(({ color, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4,
              fontSize: '0.69rem', color: 'var(--text-muted)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: color,
                display: 'inline-block', boxShadow: `0 0 5px ${color}88` }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Hover tooltip ── */}
      {hoveredNode && (
        <div style={{
          position: 'absolute',
          left: Math.min(mousePos.x + 16, containerW - 260),
          top:  Math.min(mousePos.y + 16, containerH - 130),
          zIndex: 20, pointerEvents: 'none',
          background: 'rgba(8,13,22,0.97)', border: '1px solid var(--border-bright)',
          borderRadius: 10, padding: '0.7rem 1rem', minWidth: 190, maxWidth: 240,
          backdropFilter: 'blur(14px)', boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.875rem', marginBottom: 3 }}>
            {hoveredNode.name}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>v{hoveredNode.version}</div>
          {hoveredNode.healthScore !== undefined && (
            <div style={{ fontSize: '0.72rem', marginTop: 5,
              color: HEALTH_COLORS[hoveredNode.healthLabel ?? 'watch'] }}>
              Health {hoveredNode.healthScore}/100 · {hoveredNode.healthLabel}
            </div>
          )}
          {hoveredNode.cveSeverity && (
            <div style={{ fontSize: '0.72rem', marginTop: 5,
              color: SEVERITY_COLORS[hoveredNode.cveSeverity] ?? '#ff8800' }}>
              ⚠ {hoveredNode.cveSeverity.toUpperCase()} CVE
            </div>
          )}
          <div style={{ fontSize: '0.67rem', marginTop: 5, color: 'var(--text-faint)' }}>
            {hoveredNode.isRoot ? '◆ Root' : hoveredNode.isDirect ? '● Direct' : '○ Transitive'}
            {hoveredNode.scope === 'development' ? '  [dev]' : ''}
          </div>
        </div>
      )}

      {/* ── 2D Graph ── */}
      {viewMode === '2d' && (
        <ForceGraph2D
          ref={fgRef}
          graphData={data}
          nodeId="id"
          nodeLabel=""
          nodeColor={nodeColor}
          nodeVal={nodeSize}
          width={containerW}
          height={containerH}
          // Let simulation run freely until natural stop, then pin
          onEngineStop={handleEngineStop}
          nodeCanvasObject={(node: GraphNode, ctx, globalScale) => {
            const label = node.name ?? '';
            const size  = nodeSize(node);
            const color = nodeColor(node);

            if (node.cveSeverity) { ctx.shadowBlur = 12; ctx.shadowColor = color; }

            ctx.beginPath();
            if (node.isRoot) {
              const s = size * 1.5;
              ctx.moveTo(node.x ?? 0, (node.y ?? 0) - s);
              ctx.lineTo((node.x ?? 0) + s, node.y ?? 0);
              ctx.lineTo(node.x ?? 0, (node.y ?? 0) + s);
              ctx.lineTo((node.x ?? 0) - s, node.y ?? 0);
              ctx.closePath();
            } else {
              ctx.arc(node.x ?? 0, node.y ?? 0, size, 0, 2 * Math.PI);
            }
            ctx.fillStyle = color;
            ctx.fill();
            ctx.shadowBlur = 0;

            if (node.isDirect && !node.isRoot) {
              ctx.strokeStyle = color + '55'; ctx.lineWidth = 1.5; ctx.stroke();
            }

            // Labels appear only when zoomed in sufficiently (> 2.5×)
            if (globalScale > 2.5) {
              const fontSize = Math.max(2.5, 9 / globalScale);
              ctx.font         = `${node.isRoot || node.isDirect ? 600 : 400} ${fontSize}px Inter,sans-serif`;
              ctx.fillStyle    = node.isRoot ? '#e8eef8' : node.isDirect ? '#93c5fd' : '#8b99b8';
              ctx.textAlign    = 'center';
              ctx.textBaseline = 'top';
              ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + size + 1.5);
            }
          }}
          linkColor={(link: GraphLink) => link.type === 'direct' ? '#4f8ef740' : '#1e273870'}
          linkWidth={(link: GraphLink) => link.type === 'direct' ? 1.2 : 0.5}
          onNodeClick={(node: GraphNode) => onNodeClick(node)}
          onNodeHover={(node: GraphNode | null) => setHoveredNode(node)}
          backgroundColor="#04070d"
        />
      )}

      {/* ── 3D Graph ── */}
      {viewMode === '3d' && (
        <ForceGraph3D
          ref={fgRef}
          graphData={data}
          nodeId="id"
          nodeLabel=""       // no floating labels — hover tooltip handles it
          nodeColor={nodeColor}
          nodeVal={nodeSize}
          width={containerW}
          height={containerH}
          onEngineStop={handleEngineStop}
          linkColor={(link: GraphLink) => link.type === 'direct' ? '#4f8ef748' : '#1e273880'}
          linkWidth={(link: GraphLink) => link.type === 'direct' ? 1.8 : 0.7}
          onNodeClick={(node: GraphNode) => onNodeClick(node)}
          onNodeHover={(node: GraphNode | null) => setHoveredNode(node)}
          backgroundColor="#04070d"
        />
      )}
    </div>
  );
}
