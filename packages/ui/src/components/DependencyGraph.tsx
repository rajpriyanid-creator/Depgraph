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

interface DependencyGraphProps {
  projectName: string;
  onNodeClick: (node: GraphNode) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ff4444', high: '#ff8800', medium: '#eab308', low: '#3b82f6',
};
const HEALTH_COLORS: Record<string, string> = {
  healthy: '#22c55e', watch: '#eab308', caution: '#f97316', risky: '#ef4444',
};

function nodeColor(node: GraphNode): string {
  if (node.isRoot) return '#6366f1';
  if (node.cveSeverity) return SEVERITY_COLORS[node.cveSeverity] ?? '#888';
  if (node.healthLabel) return HEALTH_COLORS[node.healthLabel] ?? '#888';
  return node.isDirect ? '#3b82f6' : '#374151';
}

function nodeSize(node: GraphNode): number {
  if (node.isRoot) return 12;
  if (node.isDirect) return 7;
  return 4;
}

// Helper to make a text sprite in Three.js
function makeTextSprite(message: string, parameters: any = {}) {
  const fontface = parameters.fontface || "Inter, sans-serif";
  const fontsize = parameters.fontsize || 38;
  const textColor = parameters.textColor || "#ffffff";
  
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) {
    const map = new THREE.Texture();
    const material = new THREE.SpriteMaterial({ map });
    return new THREE.Sprite(material);
  }

  // Clear background
  context.clearRect(0, 0, 512, 128);
  
  context.font = "600 " + fontsize + "px " + fontface;
  context.fillStyle = textColor;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(message, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(56, 14, 1);
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

  // Track container dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setDims({ w: el.clientWidth, h: el.clientHeight });
    });
    obs.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/graph/${encodeURIComponent(projectName)}`)
      .then((r) => { if (!r.ok) throw new Error(`API error ${r.status}`); return r.json(); })
      .then((d: GraphData) => setGraphData(d))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectName]);

  // Adjust forces and camera controls to optimize performance and usability
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const timer = setTimeout(() => {
      // Configure 3D-specific behaviors
      if (viewMode === '3d') {
        const controls = fg.controls ? fg.controls() : null;
        if (controls) {
          controls.enableDamping = true;
          controls.dampingFactor = 0.2;  // Snap quickly to stops
          controls.rotateSpeed = 2.0;    // Responsive rotation
          controls.zoomSpeed = 4.5;      // MUCH higher zoom speed for touchpads!
          controls.panSpeed = 1.8;       // Responsive panning
        }

        if (fg.d3Force) {
          fg.d3Force('charge').strength(-300);
          fg.d3Force('link').distance(75);
          fg.d3VelocityDecay(0.55); // Stabilize high particle movement
          fg.d3ReheatSimulation();
        }
      } else {
        // 2D force simulation setup
        if (fg.d3Force) {
          fg.d3Force('charge').strength(-200);
          fg.d3Force('link').distance(55);
          fg.d3ReheatSimulation();
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [graphData, viewMode]);

  const filteredData = useCallback((): GraphData => {
    let nodes = graphData.nodes;
    if (!filter.showDev)      nodes = nodes.filter((n) => n.scope !== 'development');
    if (filter.showVulnOnly)  nodes = nodes.filter((n) => !!n.cveSeverity || !!n.isRoot);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      nodes = nodes.filter((n) => n.name?.toLowerCase().includes(q) || !!n.isRoot);
    }
    const ids   = new Set(nodes.map((n) => n.id));
    const links = graphData.links.filter((l) =>
      ids.has(typeof l.source === 'object' ? (l.source as GraphNode).id : l.source) &&
      ids.has(typeof l.target === 'object' ? (l.target as GraphNode).id : l.target),
    );
    return { nodes, links };
  }, [graphData, filter]);

  const nodeThreeObject = useCallback((node: GraphNode) => {
    if (node.isRoot || node.isDirect) {
      const sprite = makeTextSprite(node.name, {
        fontsize: 38,
        textColor: node.isRoot ? '#e6edf3' : '#8b99ae'
      });
      const size = nodeSize(node);
      sprite.position.set(0, size + 10, 0);
      return sprite;
    }
    return new THREE.Object3D();
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', flexDirection: 'column', gap: '1rem', color: '#3d4f6b' }}>
      <div style={{ fontSize: '2.5rem', animation: 'spin 1.5s linear infinite' }}>⚡</div>
      <div style={{ fontSize: '0.9rem' }}>Loading dependency graph…</div>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', flexDirection: 'column', gap: '0.75rem', color: '#4d6079' }}>
      <div style={{ fontSize: '2rem' }}>⚠️</div>
      <div style={{ color: '#ef4444', fontWeight: 600 }}>Failed to load graph</div>
      <div style={{ fontSize: '0.8rem', color: '#3d4f6b', maxWidth: 360, textAlign: 'center' }}>{error}</div>
    </div>
  );

  const data = filteredData();

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
      onMouseMove={(e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
    >
      {/* ── Controls bar ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        background: 'linear-gradient(180deg,#0b111cee 0%,#0b111c88 80%,transparent 100%)',
        padding: '10px 14px 18px',
        display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="🔍 Search packages…"
          value={filter.search}
          onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          style={{
            background: '#0d1420dd', border: '1px solid #1e2738', color: '#c9d1d9',
            borderRadius: 8, padding: '6px 12px', fontSize: '0.83rem', width: 200,
            outline: 'none', backdropFilter: 'blur(6px)',
          }}
        />
        
        {/* 2D / 3D Toggle */}
        <div style={{
          display: 'flex', background: '#0d1420dd', border: '1px solid #1e2738',
          borderRadius: 8, padding: 2, backdropFilter: 'blur(6px)'
        }}>
          <button
            onClick={() => setViewMode('2d')}
            style={{
              background: viewMode === '2d' ? '#3b82f6' : 'transparent',
              color: viewMode === '2d' ? '#fff' : '#4d6079',
              border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem',
              fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s'
            }}
          >
            2D Graph
          </button>
          <button
            onClick={() => setViewMode('3d')}
            style={{
              background: viewMode === '3d' ? '#3b82f6' : 'transparent',
              color: viewMode === '3d' ? '#fff' : '#4d6079',
              border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem',
              fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s'
            }}
          >
            3D Graph
          </button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6,
          fontSize: '0.78rem', color: '#4d6079', cursor: 'pointer',
          background: '#0d1420bb', border: '1px solid #1e2738', borderRadius: 6,
          padding: '5px 10px', backdropFilter: 'blur(4px)' }}>
          <input type="checkbox" checked={filter.showDev}
            onChange={(e) => setFilter((f) => ({ ...f, showDev: e.target.checked }))} />
          Show dev
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6,
          fontSize: '0.78rem', color: '#4d6079', cursor: 'pointer',
          background: '#0d1420bb', border: '1px solid #1e2738', borderRadius: 6,
          padding: '5px 10px', backdropFilter: 'blur(4px)' }}>
          <input type="checkbox" checked={filter.showVulnOnly}
            onChange={(e) => setFilter((f) => ({ ...f, showVulnOnly: e.target.checked }))} />
          Vulns only
        </label>
        <span style={{ fontSize: '0.73rem', color: '#2d3d52',
          background: '#0d1420bb', border: '1px solid #1e2738', borderRadius: 6,
          padding: '5px 10px', backdropFilter: 'blur(4px)' }}>
          {data.nodes.length} nodes · {data.links.length} edges
        </span>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
          {[
            { color: '#6366f1', label: 'Root' },
            { color: '#3b82f6', label: 'Direct' },
            { color: '#374151', label: 'Transitive' },
            { color: '#ef4444', label: 'Vulnerable' },
          ].map(({ color, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4,
              fontSize: '0.7rem', color: '#4d6079' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color,
                display: 'inline-block', flexShrink: 0 }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Hover tooltip — positioned near cursor, clamped to container ── */}
      {hoveredNode && (
        <div style={{
          position: 'absolute',
          left: Math.min(mousePos.x + 14, dims.w - 240),
          top:  Math.min(mousePos.y + 14, dims.h - 110),
          zIndex: 20, pointerEvents: 'none',
          background: '#0f1621ee', border: '1px solid #1e2738', borderRadius: 10,
          padding: '0.65rem 0.9rem', minWidth: 200, maxWidth: 230,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontWeight: 700, color: '#e6edf3', fontSize: '0.875rem',
            marginBottom: 2 }}>{hoveredNode.name}</div>
          <div style={{ fontSize: '0.75rem', color: '#4d6079' }}>v{hoveredNode.version}</div>
          {hoveredNode.healthScore !== undefined && (
            <div style={{ fontSize: '0.75rem', marginTop: 4,
              color: HEALTH_COLORS[hoveredNode.healthLabel ?? 'watch'] }}>
              Health: {hoveredNode.healthScore}/100 ({hoveredNode.healthLabel})
            </div>
          )}
          {hoveredNode.cveSeverity && (
            <div style={{ fontSize: '0.75rem', marginTop: 4,
              color: SEVERITY_COLORS[hoveredNode.cveSeverity] ?? '#ff8800' }}>
              ⚠ {hoveredNode.cveSeverity.toUpperCase()} vulnerability
            </div>
          )}
          <div style={{ fontSize: '0.7rem', marginTop: 4, color: '#2d3d52' }}>
            {hoveredNode.isRoot ? '🔷 Root' : hoveredNode.isDirect ? '🔵 Direct' : '⚫ Transitive'}
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

            if (node.cveSeverity) {
              ctx.shadowBlur   = 12;
              ctx.shadowColor  = color;
            }

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
              ctx.strokeStyle = color + '66';
              ctx.lineWidth   = 1.5;
              ctx.stroke();
            }

            if (node.isDirect || node.isRoot || globalScale > 1.8) {
              const fontSize = Math.max(3, 10 / globalScale);
              ctx.font        = `${node.isDirect ? 600 : 400} ${fontSize}px Inter,sans-serif`;
              ctx.fillStyle   = node.isRoot ? '#e6edf3' : '#8b99ae';
              ctx.textAlign   = 'center';
              ctx.textBaseline= 'top';
              ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + size + 2);
            }
          }}
          linkColor={(link: GraphLink) => link.type === 'direct' ? '#3b82f644' : '#1e273888'}
          linkWidth={(link: GraphLink) => link.type === 'direct' ? 1.5 : 0.8}
          onNodeClick={(node: GraphNode) => onNodeClick(node)}
          onNodeHover={(node: GraphNode | null) => setHoveredNode(node)}
          backgroundColor="#080c12"
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
          linkColor={(link: GraphLink) => link.type === 'direct' ? '#3b82f655' : '#1e2738aa'}
          linkWidth={(link: GraphLink) => link.type === 'direct' ? 2 : 1}
          onNodeClick={(node: GraphNode) => onNodeClick(node)}
          onNodeHover={(node: GraphNode | null) => setHoveredNode(node)}
          backgroundColor="#080c12"
          width={dims.w}
          height={dims.h}
        />
      )}
    </div>
  );
}
