import { useRef, useState, useCallback, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';

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
  if (node.isRoot) return 14;
  if (node.isDirect) return 7;
  return 4;
}

// Build a Three.js label sprite
function makeTextSprite(message: string, color = '#e8eef8', size = 36) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Sprite(new THREE.SpriteMaterial());
  ctx.clearRect(0, 0, 512, 96);

  // Pill background
  ctx.fillStyle = 'rgba(8,13,22,0.72)';
  const w = ctx.measureText(message).width + size * 0.6;
  const x = (512 - w) / 2, y = 18, h = size + 12, r = 6;
  ctx.font = `600 ${size}px Inter, sans-serif`;
  const mw = ctx.measureText(message).width;
  const bx = (512 - mw - 24) / 2;
  ctx.beginPath();
  ctx.moveTo(bx + r, y); ctx.lineTo(bx + mw + 24 - r, y);
  ctx.quadraticCurveTo(bx + mw + 24, y, bx + mw + 24, y + r);
  ctx.lineTo(bx + mw + 24, y + h - r);
  ctx.quadraticCurveTo(bx + mw + 24, y + h, bx + mw + 24 - r, y + h);
  ctx.lineTo(bx + r, y + h); ctx.quadraticCurveTo(bx, y + h, bx, y + h - r);
  ctx.lineTo(bx, y + r); ctx.quadraticCurveTo(bx, y, bx + r, y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, 256, y + h / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(48, 9, 1);
  return sprite;
}

export function DependencyGraph({ projectName, onNodeClick }: DependencyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef        = useRef<any>(null);
  const [graphData,  setGraphData]  = useState<GraphData>({ nodes: [], links: [] });
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [hoveredNode,setHoveredNode]= useState<GraphNode | null>(null);
  const [mousePos,   setMousePos]   = useState({ x: 0, y: 0 });
  const [dims,       setDims]       = useState({ w: 800, h: 600 });
  const [filter,     setFilter]     = useState({ showDev: true, showVulnOnly: false, search: '' });
  const [viewMode,   setViewMode]   = useState<'2d' | '3d'>('3d');
  // Current camera zoom level — used for label visibility threshold
  const [zoomLevel,  setZoomLevel]  = useState(1);
  const simulationDoneRef = useRef(false);

  // Track container dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    obs.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    setLoading(true); setError(null); simulationDoneRef.current = false;
    fetch(`/api/graph/${encodeURIComponent(projectName)}`)
      .then(r => { if (!r.ok) throw new Error(`API error ${r.status}`); return r.json(); })
      .then((d: GraphData) => setGraphData(d))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectName]);

  // Configure forces & controls once graph data changes
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const timer = setTimeout(() => {
      if (viewMode === '3d') {
        const controls = fg.controls?.();
        if (controls) {
          // ── Disable auto-rotation ──
          controls.autoRotate      = false;
          controls.autoRotateSpeed = 0;
          controls.enableDamping   = true;
          controls.dampingFactor   = 0.15;
          controls.rotateSpeed     = 1.5;
          controls.zoomSpeed       = 4.0;
          controls.panSpeed        = 1.5;

          // Track zoom changes to update label visibility
          controls.addEventListener('change', () => {
            const cam = fg.camera?.();
            if (cam) {
              // Approximate zoom from camera distance
              const dist = cam.position.length();
              setZoomLevel(1000 / Math.max(dist, 1));
            }
          });
        }
        if (fg.d3Force) {
          fg.d3Force('charge').strength(-280);
          fg.d3Force('link').distance(70);
          fg.d3VelocityDecay(0.6);
          fg.d3ReheatSimulation();
        }
      } else {
        if (fg.d3Force) {
          fg.d3Force('charge').strength(-200);
          fg.d3Force('link').distance(55);
          fg.d3ReheatSimulation();
        }
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [graphData, viewMode]);

  // Stop simulation after it settles to avoid the hang / freeze
  const handleEngineStop = useCallback(() => {
    if (simulationDoneRef.current) return;
    simulationDoneRef.current = true;
    const fg = fgRef.current;
    if (!fg) return;
    // Freeze all node positions so the graph stays still
    const nodes = fg.graphData?.()?.nodes ?? [];
    for (const n of nodes) {
      n.fx = n.x; n.fy = n.y;
      if (viewMode === '3d') n.fz = n.z;
    }
    // Stop the simulation completely
    fg.pauseAnimation?.();
    fg.resumeAnimation?.(); // re-render once so frozen positions show
  }, [viewMode]);

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

  // For 3D: show label sprites; visible labels depend on zoom level
  // ZOOM_LABEL_THRESHOLD — show all node labels when zoomed in past this
  const ZOOM_THRESHOLD_ALL = 0.8; // below → only root/direct show labels
  const ZOOM_THRESHOLD_NONE = 0.2; // below → no labels at all

  const nodeThreeObject = useCallback((node: GraphNode) => {
    const showLabel =
      node.isRoot ||
      node.isDirect ||
      zoomLevel >= ZOOM_THRESHOLD_ALL;

    if (!showLabel || zoomLevel < ZOOM_THRESHOLD_NONE) return new THREE.Object3D();

    const color = node.isRoot ? '#e8eef8' : node.isDirect ? '#93c5fd' : '#8b99b8';
    const sprite = makeTextSprite(node.name, color, node.isRoot ? 40 : 32);
    sprite.position.set(0, nodeSize(node) + 8, 0);
    return sprite;
  }, [zoomLevel]);

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
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
      onMouseMove={e => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}>

      {/* ── Controls bar ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        background: 'linear-gradient(180deg, rgba(8,13,22,0.92) 0%, rgba(8,13,22,0.6) 80%, transparent 100%)',
        padding: '10px 14px 18px',
        display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="🔍 Search packages…"
          value={filter.search}
          onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
          style={{
            background: 'rgba(12,18,32,0.88)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', borderRadius: 8, padding: '6px 12px',
            fontSize: '0.83rem', width: 200, outline: 'none',
            backdropFilter: 'blur(8px)', fontFamily: 'var(--font-sans)',
          }}
        />

        {/* 2D / 3D Toggle */}
        <div style={{ display: 'flex', background: 'rgba(12,18,32,0.88)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 2, backdropFilter: 'blur(8px)' }}>
          {(['2d', '3d'] as const).map(m => (
            <button key={m} onClick={() => { setViewMode(m); simulationDoneRef.current = false; }}
              style={{
                background: viewMode === m ? 'var(--accent-blue)' : 'transparent',
                color: viewMode === m ? '#fff' : 'var(--text-muted)',
                border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: '0.78rem',
                fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              }}>
              {m.toUpperCase()} Graph
            </button>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem',
          color: 'var(--text-muted)', cursor: 'pointer', background: 'rgba(12,18,32,0.88)',
          border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', backdropFilter: 'blur(4px)' }}>
          <input type="checkbox" checked={filter.showDev}
            onChange={e => setFilter(f => ({ ...f, showDev: e.target.checked }))} />
          Show dev
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem',
          color: 'var(--text-muted)', cursor: 'pointer', background: 'rgba(12,18,32,0.88)',
          border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', backdropFilter: 'blur(4px)' }}>
          <input type="checkbox" checked={filter.showVulnOnly}
            onChange={e => setFilter(f => ({ ...f, showVulnOnly: e.target.checked }))} />
          Vulns only
        </label>
        <span style={{ fontSize: '0.73rem', color: 'var(--text-faint)', background: 'rgba(12,18,32,0.88)',
          border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', backdropFilter: 'blur(4px)' }}>
          {data.nodes.length} nodes · {data.links.length} edges
        </span>

        {/* Zoom label hint (3D only) */}
        {viewMode === '3d' && (
          <span style={{ fontSize: '0.68rem', color: 'var(--text-faint)', background: 'rgba(12,18,32,0.7)',
            border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', backdropFilter: 'blur(4px)',
            fontStyle: 'italic' }}>
            🔍 Zoom in to reveal labels
          </span>
        )}

        {/* Legend */}
        <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
          {[
            { color: '#a78bfa', label: 'Root' },
            { color: '#4f8ef7', label: 'Direct' },
            { color: '#374151', label: 'Transitive' },
            { color: '#f87171', label: 'Vulnerable' },
          ].map(({ color, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4,
              fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color,
                display: 'inline-block', flexShrink: 0, boxShadow: `0 0 4px ${color}88` }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Hover tooltip ── */}
      {hoveredNode && (
        <div style={{
          position: 'absolute',
          left: Math.min(mousePos.x + 14, dims.w - 250),
          top:  Math.min(mousePos.y + 14, dims.h - 120),
          zIndex: 20, pointerEvents: 'none',
          background: 'rgba(12,18,32,0.95)', border: '1px solid var(--border-bright)',
          borderRadius: 10, padding: '0.7rem 1rem', minWidth: 200, maxWidth: 240,
          backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          animation: 'fadeIn 0.1s ease',
        }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.875rem', marginBottom: 2 }}>
            {hoveredNode.name}
          </div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-faint)' }}>v{hoveredNode.version}</div>
          {hoveredNode.healthScore !== undefined && (
            <div style={{ fontSize: '0.73rem', marginTop: 5,
              color: HEALTH_COLORS[hoveredNode.healthLabel ?? 'watch'] }}>
              Health: {hoveredNode.healthScore}/100 ({hoveredNode.healthLabel})
            </div>
          )}
          {hoveredNode.cveSeverity && (
            <div style={{ fontSize: '0.73rem', marginTop: 5,
              color: SEVERITY_COLORS[hoveredNode.cveSeverity] ?? '#ff8800' }}>
              ⚠ {hoveredNode.cveSeverity.toUpperCase()} vulnerability
            </div>
          )}
          <div style={{ fontSize: '0.68rem', marginTop: 5, color: 'var(--text-faint)' }}>
            {hoveredNode.isRoot ? '◆ Root' : hoveredNode.isDirect ? '● Direct' : '○ Transitive'}
            {hoveredNode.scope === 'development' ? '  [dev]' : ''}
          </div>
        </div>
      )}

      {viewMode === '2d' ? (
        <ForceGraph2D
          ref={fgRef}
          graphData={data}
          nodeId="id"
          nodeLabel=""
          nodeColor={nodeColor}
          nodeVal={nodeSize}
          nodeCanvasObject={(node: GraphNode, ctx, globalScale) => {
            const label = node.name ?? '';
            const size  = nodeSize(node);
            const color = nodeColor(node);

            if (node.cveSeverity) { ctx.shadowBlur = 14; ctx.shadowColor = color; }

            ctx.beginPath();
            if (node.isRoot) {
              const s = size * 1.4;
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

            // Show labels: always for root/direct, for all when zoomed in past 1.8×
            if (node.isDirect || node.isRoot || globalScale > 1.8) {
              const fontSize = Math.max(3, 10 / globalScale);
              ctx.font         = `${node.isDirect || node.isRoot ? 600 : 400} ${fontSize}px Inter,sans-serif`;
              ctx.fillStyle    = node.isRoot ? '#e8eef8' : node.isDirect ? '#93c5fd' : '#8b99b8';
              ctx.textAlign    = 'center';
              ctx.textBaseline = 'top';
              ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + size + 2);
            }
          }}
          linkColor={(link: GraphLink) => link.type === 'direct' ? '#4f8ef744' : '#1e273888'}
          linkWidth={(link: GraphLink) => link.type === 'direct' ? 1.5 : 0.8}
          onNodeClick={(node: GraphNode) => onNodeClick(node)}
          onNodeHover={(node: GraphNode | null) => setHoveredNode(node)}
          onZoom={({ k }) => setZoomLevel(k)}
          onEngineStop={handleEngineStop}
          backgroundColor="#04070d"
          width={dims.w}
          height={dims.h}
        />
      ) : (
        <ForceGraph3D
          ref={fgRef}
          graphData={data}
          nodeId="id"
          nodeLabel=""
          nodeColor={nodeColor}
          nodeVal={nodeSize}
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={true}
          linkColor={(link: GraphLink) => link.type === 'direct' ? '#4f8ef755' : '#1e2738aa'}
          linkWidth={(link: GraphLink) => link.type === 'direct' ? 2 : 1}
          onNodeClick={(node: GraphNode) => onNodeClick(node)}
          onNodeHover={(node: GraphNode | null) => setHoveredNode(node)}
          onEngineStop={handleEngineStop}
          backgroundColor="#04070d"
          width={dims.w}
          height={dims.h}
        />
      )}
    </div>
  );
}
