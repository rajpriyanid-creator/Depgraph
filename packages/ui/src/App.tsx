import { useState, useEffect } from 'react';
import { DependencyGraph } from './components/DependencyGraph.js';
import { PackageDetails } from './components/PackageDetails.js';
import { VulnerabilityPanel } from './components/VulnerabilityPanel.js';
import { HealthPanel } from './components/HealthPanel.js';
import { ZombiePanel } from './components/ZombiePanel.js';
import { DuplicatesPanel } from './components/DuplicatesPanel.js';
import type { GraphNode } from './components/DependencyGraph.js';

type Tab = 'graph' | 'vulnerabilities' | 'health' | 'zombies' | 'duplicates';

const TABS: Array<{ id: Tab; label: string; icon: string; desc: string; accent: string }> = [
  { id: 'graph',           label: 'Graph',           icon: '🕸',  desc: 'Dependency tree',    accent: '#4f8ef7' },
  { id: 'vulnerabilities', label: 'Vulnerabilities', icon: '🚨',  desc: 'CVE / security',     accent: '#f87171' },
  { id: 'health',          label: 'Health',          icon: '💚',  desc: 'Package quality',    accent: '#34d399' },
  { id: 'zombies',         label: 'Zombies',         icon: '🧟',  desc: 'Unused packages',    accent: '#fbbf24' },
  { id: 'duplicates',      label: 'Duplicates',      icon: '🔁',  desc: 'Version conflicts',  accent: '#a78bfa' },
];

export default function App() {
  const [activeTab,       setActiveTab]       = useState<Tab>('graph');
  const [selectedNode,    setSelectedNode]    = useState<GraphNode | null>(null);
  const [projects,        setProjects]        = useState<string[]>([]);
  const [projectName,     setProjectName]     = useState<string>('');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [repoUrl,         setRepoUrl]         = useState<string>('');
  const [localPath,       setLocalPath]       = useState<string>('');
  const [scanningRepo,    setScanningRepo]    = useState(false);
  const [scanningLocal,   setScanningLocal]   = useState(false);
  const scanning = scanningRepo || scanningLocal;
  const [scanError,       setScanError]       = useState<string | null>(null);
  const [scanSuccess,     setScanSuccess]     = useState<string | null>(null);
  const [sidebarOpen,     setSidebarOpen]     = useState(true);
  const [workspacePath,   setWorkspacePath]   = useState<string>('');
  const [showPkgSuggest,  setShowPkgSuggest]  = useState(false);
  const [suggestReason,   setSuggestReason]   = useState<'missing_package_json' | 'invalid_package_json' | null>(null);
  const [suggestedContent, setSuggestedContent] = useState<string>('');
  const [suggestedPath,    setSuggestedPath]    = useState<string>('');
  const [initializingPkg,  setInitializingPkg]  = useState(false);

  const loadProjects = () =>
    fetch('/api/projects')
      .then(r => r.json())
      .then((data: string[]) => {
        setProjects(data);
        if (data.length > 0 && !projectName) setProjectName(data[0] ?? '');
      })
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));

  useEffect(() => {
    void loadProjects();
    fetch('/api/workspace-path').then(r => r.json()).then(d => setWorkspacePath(d.path || '')).catch(() => {});
  }, []);

  const handleScanRepo = async () => {
    if (!repoUrl.trim()) return;
    setScanningRepo(true); setScanError(null); setScanSuccess(null);
    try {
      const res  = await fetch('/api/scan-repo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repoUrl: repoUrl.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to scan repository');
      await loadProjects();
      if (data.projectName) { setProjectName(data.projectName); setSelectedNode(null); }
      setRepoUrl('');
      setScanSuccess(`Successfully scanned "${data.projectName as string}"`);
      setTimeout(() => setScanSuccess(null), 4000);
    } catch (err: any) { setScanError(err.message ?? String(err)); }
    finally { setScanningRepo(false); }
  };

  const handleScanLocal = async () => {
    const pathToScan = localPath.trim() || workspacePath;
    if (!pathToScan) return;
    setScanningLocal(true); setScanError(null); setScanSuccess(null);
    try {
      const res  = await fetch('/api/scan-local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ localPath: pathToScan }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to scan local directory');
      if (data.success === false) {
        setSuggestReason(data.reason); setSuggestedContent(data.suggestedPackageJson);
        setSuggestedPath(data.targetPath); setShowPkgSuggest(true); return;
      }
      await loadProjects();
      if (data.projectName) { setProjectName(data.projectName); setSelectedNode(null); }
      setLocalPath('');
      setScanSuccess(`Successfully scanned "${data.projectName as string}"`);
      setTimeout(() => setScanSuccess(null), 4000);
    } catch (err: any) { setScanError(err.message ?? String(err)); }
    finally { setScanningLocal(false); }
  };

  const handleInitPackageJson = async () => {
    setInitializingPkg(true); setScanError(null);
    try {
      const res = await fetch('/api/init-package-json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetPath: suggestedPath, content: suggestedContent }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to initialize package.json');
      setShowPkgSuggest(false); setLocalPath(suggestedPath);
      setTimeout(() => { void handleScanLocal(); }, 100);
    } catch (err: any) { setScanError(err.message ?? String(err)); }
    finally { setInitializingPkg(false); }
  };

  const handleTabChange = (tab: Tab) => { setActiveTab(tab); if (tab !== 'graph') setSelectedNode(null); };
  const activeTabInfo = TABS.find(t => t.id === activeTab)!;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-void)', fontFamily: 'var(--font-sans)' }}>

      {/* Ambient background glow */}
      <div style={{ position: 'fixed', top: '-20%', left: '10%', width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(79,142,247,0.05) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-10%', right: '5%', width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(167,139,250,0.04) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* ── Sidebar ── */}
      <nav style={{
        width: sidebarOpen ? 252 : 62, flexShrink: 0, transition: 'width 0.28s cubic-bezier(0.4,0,0.2,1)',
        background: 'linear-gradient(180deg, rgba(12,18,32,0.97) 0%, rgba(8,13,22,0.97) 100%)',
        borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', backdropFilter: 'blur(20px)', position: 'relative', zIndex: 10,
        boxShadow: '4px 0 40px rgba(0,0,0,0.5)',
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'space-between' : 'center',
          padding: sidebarOpen ? '1.2rem 1rem 1rem' : '1.2rem 0 1rem', borderBottom: '1px solid var(--border)' }}>
          {sidebarOpen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--gradient-brand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem',
                boxShadow: '0 4px 12px rgba(79,142,247,0.4)', flexShrink: 0 }}>⚡</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.025em',
                  background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  DepGraph
                </div>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-faint)', letterSpacing: '0.1em',
                  textTransform: 'uppercase', marginTop: 1 }}>Intelligence Platform</div>
              </div>
            </div>
          )}
          {!sidebarOpen && (
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--gradient-brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem',
              boxShadow: '0 4px 12px rgba(79,142,247,0.35)' }}>⚡</div>
          )}
          {sidebarOpen && (
            <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-faint)', padding: '4px 6px', borderRadius: 6, fontSize: '0.7rem',
              transition: 'color 0.15s', display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}>◀</button>
          )}
        </div>

        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-faint)', padding: '0.6rem 0', fontSize: '0.7rem', width: '100%', borderBottom: '1px solid var(--border)' }}>▶</button>
        )}

        {/* Scan sections */}
        {sidebarOpen && (
          <div style={{ overflowY: 'auto', flex: 1 }}>

            {/* Repo scanner */}
            <SideSection title="Scan Repository">
              <input type="text" placeholder="github.com/user/repo" value={repoUrl}
                onChange={e => setRepoUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !scanning && void handleScanRepo()}
                disabled={scanning} style={inputStyle} />
              <button onClick={() => void handleScanRepo()} disabled={scanning || !repoUrl.trim()}
                style={btnStyle(scanning || !repoUrl.trim(), '#4f8ef7')}>
                {scanningRepo ? <><Spinner /> Cloning…</> : '🔍 Analyze Repo'}
              </button>
            </SideSection>

            {/* Local scanner */}
            <SideSection title="Scan Local Path">
              <input type="text" placeholder={workspacePath ? `${workspacePath}` : 'C:\\projects\\my-app'}
                value={localPath} onChange={e => setLocalPath(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !scanning && void handleScanLocal()}
                disabled={scanning} style={inputStyle} />
              <button onClick={() => void handleScanLocal()} disabled={scanning || (!localPath.trim() && !workspacePath)}
                style={btnStyle(scanning || (!localPath.trim() && !workspacePath), '#a78bfa')}>
                {scanningLocal ? <><Spinner /> Scanning…</> : (localPath.trim() ? '📁 Analyze Local' : '📁 Analyze Workspace')}
              </button>
            </SideSection>

            {/* Status messages */}
            {scanSuccess && (
              <div style={{ margin: '0 0.85rem 0.6rem', padding: '0.55rem 0.75rem', borderRadius: 8,
                background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)',
                color: '#34d399', fontSize: '0.73rem', lineHeight: 1.45, animation: 'slideIn 0.2s ease' }}>
                ✅ {scanSuccess}
              </div>
            )}
            {scanError && (
              <div style={{ margin: '0 0.85rem 0.6rem', padding: '0.55rem 0.75rem', borderRadius: 8,
                background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)',
                color: '#f87171', fontSize: '0.73rem', lineHeight: 1.45 }}>
                ⚠ {scanError}
              </div>
            )}

            {/* Project picker */}
            <SideSection title="Active Project">
              {loadingProjects ? (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-faint)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Spinner /> Loading…
                </div>
              ) : projects.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-faint)', lineHeight: 1.5 }}>
                  No scans yet. Paste a GitHub URL above ↑
                </div>
              ) : (
                <select value={projectName} onChange={e => { setProjectName(e.target.value); setSelectedNode(null); }}
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  {projects.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
            </SideSection>
          </div>
        )}

        {/* Nav tabs */}
        <div style={{ padding: sidebarOpen ? '0.5rem 0' : '0.5rem 0', borderTop: '1px solid var(--border)', flex: sidebarOpen ? 0 : 1 }}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                title={sidebarOpen ? '' : tab.label}
                style={{
                  width: '100%', background: active ? `linear-gradient(90deg, ${tab.accent}14, transparent)` : 'none',
                  border: 'none', borderLeft: `3px solid ${active ? tab.accent : 'transparent'}`,
                  color: active ? tab.accent : 'var(--text-muted)',
                  padding: sidebarOpen ? '0.65rem 0.9rem' : '0.7rem 0',
                  textAlign: 'left', cursor: 'pointer', fontSize: '0.83rem', fontWeight: active ? 600 : 400,
                  display: 'flex', alignItems: 'center',
                  gap: sidebarOpen ? '0.6rem' : 0,
                  justifyContent: sidebarOpen ? 'flex-start' : 'center',
                  transition: 'all 0.15s ease',
                }}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>{tab.icon}</span>
                {sidebarOpen && (
                  <div>
                    <div style={{ fontSize: '0.83rem' }}>{tab.label}</div>
                    <div style={{ fontSize: '0.65rem', color: active ? tab.accent + '99' : 'var(--text-faint)', marginTop: 1 }}>{tab.desc}</div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {sidebarOpen && (
          <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--border)', fontSize: '0.62rem', color: 'var(--text-faint)' }}>
            Powered by Neo4j · DepGraph v1.0
          </div>
        )}
      </nav>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>

        {/* Top bar */}
        <div style={{
          height: 52, flexShrink: 0, display: 'flex', alignItems: 'center',
          padding: '0 1.5rem', borderBottom: '1px solid var(--border)',
          background: 'rgba(8,13,22,0.85)', backdropFilter: 'blur(16px)', gap: '0.75rem', zIndex: 5,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-faint)' }}>
            <span style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>⚡</span>
            <span style={{ color: 'var(--text-faint)' }}>/</span>
            <span style={{ color: activeTabInfo.accent, fontWeight: 600 }}>{projectName || '—'}</span>
            <span style={{ color: 'var(--text-faint)' }}>/</span>
            <span style={{ color: 'var(--text-secondary)' }}>{activeTabInfo.label}</span>
          </div>
          <div style={{ flex: 1 }} />
          {projectName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.72rem', color: 'var(--text-secondary)',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '4px 10px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: activeTabInfo.accent, display: 'inline-block', boxShadow: `0 0 6px ${activeTabInfo.accent}` }} />
              {projectName}
            </div>
          )}
        </div>

        {/* Panel area */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {!projectName ? (
            <EmptyState />
          ) : (
            <>
              {activeTab === 'graph' && (
                <div style={{ position: 'absolute', inset: 0 }}>
                  <DependencyGraph projectName={projectName} onNodeClick={setSelectedNode} />
                  {selectedNode && <PackageDetails node={selectedNode} onClose={() => setSelectedNode(null)} />}
                </div>
              )}
              {activeTab === 'vulnerabilities' && <ScrollPanel><VulnerabilityPanel projectName={projectName} /></ScrollPanel>}
              {activeTab === 'health'          && <ScrollPanel><HealthPanel projectName={projectName} /></ScrollPanel>}
              {activeTab === 'zombies'         && <ScrollPanel><ZombiePanel projectName={projectName} /></ScrollPanel>}
              {activeTab === 'duplicates'      && <ScrollPanel><DuplicatesPanel projectName={projectName} /></ScrollPanel>}
            </>
          )}
        </div>
      </main>

      {/* Package.json Suggestion Modal */}
      {showPkgSuggest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,7,13,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, backdropFilter: 'blur(8px)', animation: 'fadeIn 0.2s ease' }}>
          <div style={{ background: 'linear-gradient(135deg, #0c1424, #0f1a2e)', border: '1px solid var(--border-bright)',
            borderRadius: 16, width: '90%', maxWidth: 580, padding: '1.75rem',
            boxShadow: '0 24px 64px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', gap: '1rem',
            animation: 'slideIn 0.25s ease' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px',
                display: 'flex', alignItems: 'center', gap: 8 }}>
                ⚠️ {suggestReason === 'missing_package_json' ? 'Missing package.json' : 'Invalid package.json'}
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                DepGraph could not find a valid package.json in <strong style={{ color: 'var(--text-primary)' }}>{suggestedPath}</strong>.
                We scanned your code files for library imports and created a suggested configuration.
              </p>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-faint)',
                textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
                Suggested package.json
              </div>
              <pre style={{ background: '#050810', border: '1px solid var(--border)', borderRadius: 10,
                padding: '1rem', overflowX: 'auto', fontSize: '0.77rem', color: '#93c5fd',
                maxHeight: 200, margin: 0, fontFamily: 'var(--font-mono)' }}>
                <code>{suggestedContent}</code>
              </pre>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={() => setShowPkgSuggest(false)}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', color: 'var(--text-secondary)',
                  borderRadius: 8, padding: '8px 16px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => void handleInitPackageJson()} disabled={initializingPkg}
                style={{ background: 'var(--gradient-brand)', border: 'none', color: '#fff',
                  borderRadius: 8, padding: '8px 18px', fontSize: '0.82rem', fontWeight: 600,
                  cursor: initializingPkg ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 16px rgba(79,142,247,0.4)' }}>
                {initializingPkg ? '⏳ Initializing…' : '📝 Create & Analyze'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shared helpers ── */
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(8,13,22,0.8)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', borderRadius: 8, padding: '7px 10px',
  fontSize: '0.77rem', outline: 'none', marginBottom: '0.45rem',
  boxSizing: 'border-box', fontFamily: 'var(--font-sans)',
  transition: 'border-color 0.15s',
};

function btnStyle(disabled: boolean, accent: string): React.CSSProperties {
  return {
    width: '100%', background: disabled ? 'rgba(15,26,46,0.6)' : `linear-gradient(135deg, ${accent}dd, ${accent}99)`,
    border: `1px solid ${disabled ? 'var(--border)' : accent + '55'}`,
    color: disabled ? 'var(--text-faint)' : '#fff',
    borderRadius: 8, padding: '7px 10px', fontSize: '0.78rem', fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
    boxShadow: disabled ? 'none' : `0 4px 14px ${accent}33`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  };
}

function Spinner() {
  return <span style={{ display: 'inline-block', animation: 'spin 0.7s linear infinite', fontSize: '0.8rem' }}>⟳</span>;
}

function SideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '0.8rem 0.85rem', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-faint)', letterSpacing: '0.1em',
        textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  );
}

function ScrollPanel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '1.75rem',
      background: 'transparent', animation: 'fadeIn 0.2s ease' }}>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', flexDirection: 'column', gap: '1.5rem', userSelect: 'none',
      animation: 'fadeIn 0.3s ease' }}>
      <div style={{ position: 'relative' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--gradient-glow)',
          border: '1px solid rgba(79,142,247,0.2)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '2.5rem', animation: 'glow-pulse 3s ease-in-out infinite' }}>⚡</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
          No project selected
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-faint)', maxWidth: 360, lineHeight: 1.6 }}>
          Paste a GitHub URL in the sidebar or point to a local directory — even if{' '}
          <strong style={{ color: 'var(--text-muted)' }}>package.json</strong> is inside{' '}
          <code style={{ color: 'var(--accent-blue)', background: 'var(--bg-card)', padding: '1px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>backend/</code> or{' '}
          <code style={{ color: 'var(--accent-purple)', background: 'var(--bg-card)', padding: '1px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>frontend/</code>.
        </div>
      </div>
    </div>
  );
}
