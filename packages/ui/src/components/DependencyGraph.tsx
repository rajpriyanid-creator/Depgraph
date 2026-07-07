import { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';

export interface GraphNode {
  id: string; name: string; version: string; scope?: string;
  isDirect?: boolean; isRoot?: boolean; cveSeverity?: string;
  cveIds?: string[]; healthScore?: number; healthLabel?: string;
  x?: number; y?: number; z?: number;
  vx?: number; vy?: number; vz?: number;
  fx?: number; fy?: number; fz?: number;
}
export interface GraphLink { source: string; target: string; type?: string; }
interface GraphData { nodes: GraphNode[]; links: GraphLink[]; }
interface Props { projectName: string; onNodeClick: (node: GraphNode) => void; }

const SEV: Record<string, string> = { critical:'#ff4444', high:'#ff8800', medium:'#eab308', low:'#3b82f6' };
const HPH: Record<string, string> = { healthy:'#22c55e', watch:'#eab308', caution:'#f97316', risky:'#ef4444' };

function nodeColor(n: GraphNode) {
  if (n.isRoot) return '#a78bfa';
  if (n.cveSeverity) return SEV[n.cveSeverity] ?? '#888';
  if (n.healthLabel) return HPH[n.healthLabel] ?? '#888';
  return n.isDirect ? '#4f8ef7' : '#374151';
}
function nodeSize(n: GraphNode) { return n.isRoot ? 12 : n.isDirect ? 6 : 3.5; }

/** Build a canvas-texture label sprite (cheap, created once per node) */
function makeSprite(text: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 80;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 34px Inter,sans-serif';
  const tw = ctx.measureText(text).width;
  // pill bg
  ctx.fillStyle = 'rgba(4,7,13,0.78)';
  const px = (512 - tw) / 2 - 12, py = 10, pw = tw + 24, ph = 58, r = 8;
  ctx.beginPath();
  ctx.moveTo(px+r,py); ctx.lineTo(px+pw-r,py); ctx.quadraticCurveTo(px+pw,py,px+pw,py+r);
  ctx.lineTo(px+pw,py+ph-r); ctx.quadraticCurveTo(px+pw,py+ph,px+pw-r,py+ph);
  ctx.lineTo(px+r,py+ph); ctx.quadraticCurveTo(px,py+ph,px,py+ph-r);
  ctx.lineTo(px,py+r); ctx.quadraticCurveTo(px,py,px+r,py); ctx.closePath(); ctx.fill();
  // text
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 39);
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(40, 6.5, 1);
  return s;
}

export function DependencyGraph({ projectName, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef        = useRef<any>(null);
  const pinnedRef    = useRef(false);
  const zoomRef      = useRef(1); // track 3D zoom WITHOUT triggering re-render

  const [graphData,   setGraphData]   = useState<GraphData>({ nodes: [], links: [] });
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [mousePos,    setMousePos]    = useState({ x:0, y:0 });
  const [dims,        setDims]        = useState<{w:number,h:number}|null>(null);
  const [filter,      setFilter]      = useState({ showDev:true, showVulnOnly:false, search:'' });
  const [viewMode,    setViewMode]    = useState<'2d'|'3d'>('3d');

  // ── Measure container (layout-sync so we get the right size immediately) ──
  useLayoutEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setDims({ w: Math.floor(r.width), h: Math.floor(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true); setError(null); pinnedRef.current = false;
    fetch(`/api/graph/${encodeURIComponent(projectName)}`)
      .then(r => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then((d: GraphData) => setGraphData(d))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectName]);

  // ── Forces & controls ──────────────────────────────────────────────────────
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || graphData.nodes.length === 0) return;
    pinnedRef.current = false;
    const t = setTimeout(() => {
      if (viewMode === '3d') {
        const ctrl = fg.controls?.();
        if (ctrl) {
          ctrl.autoRotate = false; ctrl.autoRotateSpeed = 0;
          ctrl.enableDamping = true; ctrl.dampingFactor = 0.1;
          ctrl.rotateSpeed = 1.2; ctrl.zoomSpeed = 3.0; ctrl.panSpeed = 1.0;
          // Update label visibility on every camera change (no state = no re-render lag)
          ctrl.addEventListener('change', () => {
            const cam = fg.camera?.();
            if (!cam) return;
            const zoom = 1000 / Math.max(cam.position.length(), 1);
            zoomRef.current = zoom;
            const showAll = zoom > 0.6;
            const scene: THREE.Scene | undefined = fg.scene?.();
            if (!scene) return;
            scene.traverse((obj: THREE.Object3D) => {
              if ((obj as any).__isLabel) {
                const node: GraphNode | undefined = (obj.parent as any)?.__nodeData;
                if (node && !node.isRoot && !node.isDirect) {
                  obj.visible = showAll;
                }
              }
            });
          });
        }
      }
      fg.d3Force?.('charge')?.strength(viewMode === '3d' ? -220 : -180);
      fg.d3Force?.('link')?.distance(viewMode === '3d' ? 65 : 50);
      fg.d3VelocityDecay?.(0.5);
      fg.d3ReheatSimulation?.();
    }, 100);
    return () => clearTimeout(t);
  }, [graphData, viewMode]);

  // ── Pin nodes once settled ─────────────────────────────────────────────────
  const handleEngineStop = useCallback(() => {
    if (pinnedRef.current) return;
    const fg = fgRef.current;
    if (!fg) return;
    const nodes: GraphNode[] = fg.graphData?.()?.nodes ?? [];
    const spread = nodes.some(n => Math.abs(n.x ?? 0) > 5 || Math.abs(n.y ?? 0) > 5);
    if (!spread) return;
    pinnedRef.current = true;
    for (const n of nodes) {
      n.fx = n.x ?? 0; n.fy = n.y ?? 0;
      if (viewMode === '3d') n.fz = n.z ?? 0;
    }
  }, [viewMode]);

  // ── 3D label objects — created ONCE, no zoom dependency ───────────────────
  // Shows label for root/direct always, transitive only when zoomed in.
  // We use a Group: sphere mesh + label sprite so they travel together.
  const nodeThreeObject = useCallback((node: GraphNode) => {
    const color = nodeColor(node);
    const size  = nodeSize(node);

    const group = new THREE.Group();

    // Sphere
    const geo = node.isRoot
      ? new THREE.OctahedronGeometry(size)
      : new THREE.SphereGeometry(size, 12, 12);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    group.add(mesh);

    // Label sprite — always created; visibility toggled via onRenderFramePost
    if (node.name) {
      const labelColor = node.isRoot ? '#e8eef8' : node.isDirect ? '#93c5fd' : '#8b99b8';
      const sprite = makeSprite(node.name, labelColor);
      sprite.position.set(0, size + 5, 0);
      // tag so we can find it later
      (sprite as any).__isLabel = true;
      // transitive nodes start hidden; root/direct always visible
      sprite.visible = !!(node.isRoot || node.isDirect);
      group.add(sprite);
    }

    return group;
  }, []); // stable — no deps



  // ── Filter ─────────────────────────────────────────────────────────────────
  const filteredData = useCallback((): GraphData => {
    let nodes = graphData.nodes;
    if (!filter.showDev)     nodes = nodes.filter(n => n.scope !== 'development');
    if (filter.showVulnOnly) nodes = nodes.filter(n => !!n.cveSeverity || !!n.isRoot);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      nodes = nodes.filter(n => n.name?.toLowerCase().includes(q) || !!n.isRoot);
    }
    const ids = new Set(nodes.map(n => n.id));
    const links = graphData.links.filter(l =>
      ids.has(typeof l.source==='object'?(l.source as GraphNode).id:l.source) &&
      ids.has(typeof l.target==='object'?(l.target as GraphNode).id:l.target)
    );
    return { nodes, links };
  }, [graphData, filter]);

  const switchView = (mode: '2d'|'3d') => {
    const nodes: GraphNode[] = fgRef.current?.graphData?.()?.nodes ?? [];
    for (const n of nodes) { delete n.fx; delete n.fy; delete n.fz; }
    pinnedRef.current = false;
    setViewMode(mode);
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100%', flexDirection:'column', gap:'1rem', color:'var(--text-muted)' }}>
      <div style={{ fontSize:'2.5rem', animation:'spin 1.5s linear infinite' }}>⚡</div>
      <div style={{ fontSize:'0.9rem' }}>Loading dependency graph…</div>
    </div>
  );
  if (error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100%', flexDirection:'column', gap:'0.75rem' }}>
      <div style={{ fontSize:'2rem' }}>⚠️</div>
      <div style={{ color:'var(--accent-red)', fontWeight:600 }}>Failed to load graph</div>
      <div style={{ fontSize:'0.8rem', color:'var(--text-muted)', maxWidth:360, textAlign:'center' }}>{error}</div>
    </div>
  );

  const data = filteredData();

  return (
    <div ref={containerRef}
      style={{ position:'relative', width:'100%', height:'100%', overflow:'hidden' }}
      onMouseMove={e => {
        const r = containerRef.current?.getBoundingClientRect();
        if (r) setMousePos({ x:e.clientX-r.left, y:e.clientY-r.top });
      }}>

      {/* Controls */}
      <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:10,
        background:'linear-gradient(180deg,rgba(4,7,13,0.95) 0%,rgba(4,7,13,0.4) 80%,transparent 100%)',
        padding:'10px 14px 22px', display:'flex', gap:'0.5rem', flexWrap:'wrap', alignItems:'center' }}>
        <input type="text" placeholder="🔍 Search…" value={filter.search}
          onChange={e => setFilter(f => ({...f, search:e.target.value}))}
          style={{ background:'rgba(12,18,32,0.92)', border:'1px solid var(--border)',
            color:'var(--text-primary)', borderRadius:8, padding:'5px 11px',
            fontSize:'0.82rem', width:175, outline:'none', fontFamily:'var(--font-sans)' }} />

        <div style={{ display:'flex', background:'rgba(12,18,32,0.92)',
          border:'1px solid var(--border)', borderRadius:8, padding:2 }}>
          {(['2d','3d'] as const).map(m => (
            <button key={m} onClick={() => switchView(m)} style={{
              background: viewMode===m ? 'var(--accent-blue)' : 'transparent',
              color: viewMode===m ? '#fff' : 'var(--text-muted)',
              border:'none', borderRadius:6, padding:'4px 12px',
              fontSize:'0.78rem', fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
              {m.toUpperCase()} Graph
            </button>
          ))}
        </div>

        {[['showDev','Dev'],['showVulnOnly','Vulns only']].map(([k,lbl]) => (
          <label key={k} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.78rem',
            color:'var(--text-muted)', cursor:'pointer', background:'rgba(12,18,32,0.92)',
            border:'1px solid var(--border)', borderRadius:6, padding:'4px 9px' }}>
            <input type="checkbox" checked={(filter as any)[k]}
              onChange={e => setFilter(f => ({...f, [k]:e.target.checked}))} />
            {lbl}
          </label>
        ))}

        <span style={{ fontSize:'0.72rem', color:'var(--text-faint)',
          background:'rgba(12,18,32,0.92)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 9px' }}>
          {data.nodes.length} nodes · {data.links.length} edges
        </span>

        {viewMode==='3d' && (
          <span style={{ fontSize:'0.68rem', color:'var(--text-faint)',
            background:'rgba(12,18,32,0.7)', border:'1px solid var(--border)',
            borderRadius:6, padding:'4px 8px', fontStyle:'italic' }}>
            🔍 Zoom in to see all names
          </span>
        )}

        <div style={{ marginLeft:'auto', display:'flex', gap:'0.4rem', alignItems:'center' }}>
          {[{color:'#a78bfa',label:'Root'},{color:'#4f8ef7',label:'Direct'},
            {color:'#556070',label:'Transitive'},{color:'#f87171',label:'Vulnerable'}]
            .map(({color,label}) => (
            <span key={label} style={{ display:'flex', alignItems:'center', gap:4,
              fontSize:'0.69rem', color:'var(--text-muted)' }}>
              <span style={{ width:7,height:7,borderRadius:'50%',background:color,
                display:'inline-block',boxShadow:`0 0 5px ${color}88` }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredNode && dims && (
        <div style={{ position:'absolute',
          left:Math.min(mousePos.x+16, dims.w-260),
          top: Math.min(mousePos.y+16, dims.h-140),
          zIndex:20, pointerEvents:'none',
          background:'rgba(8,13,22,0.97)', border:'1px solid var(--border-bright)',
          borderRadius:10, padding:'0.7rem 1rem', minWidth:190, maxWidth:240,
          backdropFilter:'blur(14px)', boxShadow:'0 8px 32px rgba(0,0,0,0.7)' }}>
          <div style={{ fontWeight:700, color:'var(--text-primary)', fontSize:'0.875rem', marginBottom:3 }}>
            {hoveredNode.name}
          </div>
          <div style={{ fontSize:'0.72rem', color:'var(--text-faint)' }}>v{hoveredNode.version}</div>
          {hoveredNode.healthScore!==undefined && (
            <div style={{ fontSize:'0.72rem', marginTop:5,
              color:HPH[hoveredNode.healthLabel??'watch'] }}>
              Health {hoveredNode.healthScore}/100 · {hoveredNode.healthLabel}
            </div>
          )}
          {hoveredNode.cveSeverity && (
            <div style={{ fontSize:'0.72rem', marginTop:5,
              color:SEV[hoveredNode.cveSeverity]??'#ff8800' }}>
              ⚠ {hoveredNode.cveSeverity.toUpperCase()} CVE
            </div>
          )}
          <div style={{ fontSize:'0.67rem', marginTop:5, color:'var(--text-faint)' }}>
            {hoveredNode.isRoot?'◆ Root':hoveredNode.isDirect?'● Direct':'○ Transitive'}
            {hoveredNode.scope==='development'?'  [dev]':''}
          </div>
        </div>
      )}

      {/* Graphs — only render once container is measured */}
      {dims && viewMode==='2d' && (
        <ForceGraph2D ref={fgRef} graphData={data} nodeId="id" nodeLabel=""
          nodeColor={nodeColor} nodeVal={nodeSize}
          width={dims.w} height={dims.h}
          onEngineStop={handleEngineStop}
          nodeCanvasObject={(node:GraphNode, ctx, gs) => {
            const lbl=node.name??'', sz=nodeSize(node), col=nodeColor(node);
            if (node.cveSeverity) { ctx.shadowBlur=12; ctx.shadowColor=col; }
            ctx.beginPath();
            if (node.isRoot) {
              const s=sz*1.5;
              ctx.moveTo(node.x??0,(node.y??0)-s); ctx.lineTo((node.x??0)+s,node.y??0);
              ctx.lineTo(node.x??0,(node.y??0)+s); ctx.lineTo((node.x??0)-s,node.y??0);
              ctx.closePath();
            } else { ctx.arc(node.x??0,node.y??0,sz,0,2*Math.PI); }
            ctx.fillStyle=col; ctx.fill(); ctx.shadowBlur=0;
            if (node.isDirect&&!node.isRoot){ctx.strokeStyle=col+'55';ctx.lineWidth=1.5;ctx.stroke();}
            if (gs>2.5) {
              const fs=Math.max(2.5,9/gs);
              ctx.font=`${node.isRoot||node.isDirect?600:400} ${fs}px Inter,sans-serif`;
              ctx.fillStyle=node.isRoot?'#e8eef8':node.isDirect?'#93c5fd':'#8b99b8';
              ctx.textAlign='center'; ctx.textBaseline='top';
              ctx.fillText(lbl,node.x??0,(node.y??0)+sz+1.5);
            }
          }}
          linkColor={(l:GraphLink)=>l.type==='direct'?'#4f8ef740':'#1e273870'}
          linkWidth={(l:GraphLink)=>l.type==='direct'?1.2:0.5}
          onNodeClick={(n:GraphNode)=>onNodeClick(n)}
          onNodeHover={(n:GraphNode|null)=>setHoveredNode(n)}
          backgroundColor="#04070d" />
      )}

      {dims && viewMode==='3d' && (
        <ForceGraph3D ref={fgRef} graphData={data} nodeId="id" nodeLabel=""
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={false}
          width={dims.w} height={dims.h}
          onEngineStop={handleEngineStop}
          linkColor={(l:GraphLink)=>l.type==='direct'?'#4f8ef748':'#1e273880'}
          linkWidth={(l:GraphLink)=>l.type==='direct'?1.8:0.7}
          onNodeClick={(n:GraphNode)=>onNodeClick(n)}
          onNodeHover={(n:GraphNode|null)=>setHoveredNode(n)}
          backgroundColor="#04070d" />
      )}
    </div>
  );
}
