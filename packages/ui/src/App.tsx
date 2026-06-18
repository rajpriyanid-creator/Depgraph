import { useState, useEffect } from 'react';
import { DependencyGraph } from './components/DependencyGraph.js';
import { PackageDetails } from './components/PackageDetails.js';
import { VulnerabilityPanel } from './components/VulnerabilityPanel.js';
import { HealthPanel } from './components/HealthPanel.js';
import { ZombiePanel } from './components/ZombiePanel.js';
import { DuplicatesPanel } from './components/DuplicatesPanel.js';
import type { GraphNode } from './components/DependencyGraph.js';

type Tab = 'graph' | 'vulnerabilities' | 'health' | 'zombies' | 'duplicates';

const TABS: Array<{ id: Tab; label: string; icon: string; desc: string }> = [
  { id: 'graph',           label: 'Graph',           icon: '🕸',  desc: 'Dependency tree' },
  { id: 'vulnerabilities', label: 'Vulnerabilities', icon: '🚨',  desc: 'CVE / security' },
  { id: 'health',          label: 'Health',          icon: '💚',  desc: 'Package quality' },
  { id: 'zombies',         label: 'Zombies',         icon: '🧟',  desc: 'Unused packages' },
  { id: 'duplicates',      label: 'Duplicates',      icon: '🔁',  desc: 'Version conflicts' },
];

export default function App() {
  const [activeTab,      setActiveTab]      = useState<Tab>('graph');
  const [selectedNode,   setSelectedNode]   = useState<GraphNode | null>(null);
  const [projects,       setProjects]       = useState<string[]>([]);
  const [projectName,    setProjectName]    = useState<string>('');
  const [loadingProjects,setLoadingProjects]= useState(true);
  const [repoUrl,        setRepoUrl]        = useState<string>('');
  const [localPath,      setLocalPath]      = useState<string>('');
  const [scanningRepo,   setScanningRepo]   = useState(false);
  const [scanningLocal,  setScanningLocal]  = useState(false);
  const scanning = scanningRepo || scanningLocal;
  const [scanError,      setScanError]      = useState<string | null>(null);
  const [scanSuccess,    setScanSuccess]    = useState<string | null>(null);
  const [sidebarOpen,    setSidebarOpen]    = useState(true);

  // Suggested package.json config states
  const [workspacePath,  setWorkspacePath]  = useState<string>('');
  const [showPkgSuggest, setShowPkgSuggest] = useState(false);
  const [suggestReason,  setSuggestReason]  = useState<'missing_package_json' | 'invalid_package_json' | null>(null);
  const [suggestedContent, setSuggestedContent] = useState<string>('');
  const [suggestedPath,   setSuggestedPath]   = useState<string>('');
  const [initializingPkg, setInitializingPkg] = useState(false);

  const loadProjects = () =>
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data: string[]) => {
        setProjects(data);
        if (data.length > 0 && !projectName) setProjectName(data[0] ?? '');
      })
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));

  useEffect(() => {
    void loadProjects();
    fetch('/api/workspace-path')
      .then((r) => r.json())
      .then((data) => setWorkspacePath(data.path || ''))
      .catch(() => {});
  }, []);

  const handleScanRepo = async () => {
    if (!repoUrl.trim()) return;
    setScanningRepo(true);
    setScanError(null);
    setScanSuccess(null);
    try {
      const res  = await fetch('/api/scan-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repoUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to scan repository');
      await loadProjects();
      if (data.projectName) { setProjectName(data.projectName); setSelectedNode(null); }
      setRepoUrl('');
      setScanSuccess(`✅ Successfully scanned "${data.projectName as string}"`);
      setTimeout(() => setScanSuccess(null), 4000);
    } catch (err: any) {
      setScanError(err.message ?? String(err));
    } finally {
      setScanningRepo(false);
    }
  };

  const handleScanLocal = async () => {
    const pathToScan = localPath.trim() || workspacePath;
    if (!pathToScan) return;
    setScanningLocal(true);
    setScanError(null);
    setScanSuccess(null);
    try {
      const res  = await fetch('/api/scan-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localPath: pathToScan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to scan local directory');
      
      if (data.success === false) {
        setSuggestReason(data.reason);
        setSuggestedContent(data.suggestedPackageJson);
        setSuggestedPath(data.targetPath);
        setShowPkgSuggest(true);
        return;
      }

      await loadProjects();
      if (data.projectName) { setProjectName(data.projectName); setSelectedNode(null); }
      setLocalPath('');
      setScanSuccess(`✅ Successfully scanned "${data.projectName as string}"`);
      setTimeout(() => setScanSuccess(null), 4000);
    } catch (err: any) {
      setScanError(err.message ?? String(err));
    } finally {
      setScanningLocal(false);
    }
  };

  const handleInitPackageJson = async () => {
    setInitializingPkg(true);
    setScanError(null);
    try {
      const res = await fetch('/api/init-package-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath: suggestedPath, content: suggestedContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to initialize package.json');
      
      setShowPkgSuggest(false);
      setLocalPath(suggestedPath);
      // Wait a bit and trigger scan
      setTimeout(() => {
        void handleScanLocal();
      }, 100);
    } catch (err: any) {
      setScanError(err.message ?? String(err));
    } finally {
      setInitializingPkg(false);
    }
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tab !== 'graph') setSelectedNode(null);
  };

  const sidebarW = sidebarOpen ? 240 : 60;

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: '#080c12', fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* ── Sidebar ── */}
      <nav style={{
        width: sidebarW, flexShrink: 0, transition: 'width 0.25s ease',
        background: 'linear-gradient(180deg,#0f1621 0%,#0b111c 100%)',
        borderRight: '1px solid #1e2738',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '2px 0 20px rgba(0,0,0,0.4)',
      }}>

        {/* Logo row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'space-between' : 'center',
          padding: sidebarOpen ? '1.1rem 1rem 0.9rem' : '1.1rem 0',
          borderBottom: '1px solid #1e2738',
        }}>
          {sidebarOpen && (
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.03em',
                background: 'linear-gradient(135deg,#58a6ff,#bc8cff)', WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent' }}>
                ⚡ DepGraph
              </div>
              <div style={{ fontSize: '0.65rem', color: '#3d4f6b', marginTop: 2, letterSpacing: '0.05em' }}>
                DEPENDENCY INTELLIGENCE
              </div>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#3d4f6b',
            padding: 4, borderRadius: 4, fontSize: '0.85rem', lineHeight: 1,
          }} title={sidebarOpen ? 'Collapse' : 'Expand'}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Repo scanner */}
        {sidebarOpen && (
          <div style={{ padding: '0.75rem 0.85rem', borderBottom: '1px solid #1e2738' }}>
            <div style={{ fontSize: '0.62rem', color: '#3d4f6b', letterSpacing: '0.09em',
              textTransform: 'uppercase', marginBottom: '0.45rem', fontWeight: 600 }}>
              Scan Repository
            </div>
            <input
              type="text"
              placeholder="github.com/user/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !scanning && void handleScanRepo()}
              disabled={scanning}
              style={{
                width: '100%', background: '#0d1420', border: '1px solid #1e2738',
                color: '#c9d1d9', borderRadius: 6, padding: '6px 9px',
                fontSize: '0.77rem', outline: 'none', marginBottom: '0.4rem',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={() => void handleScanRepo()}
              disabled={scanning || !repoUrl.trim()}
              style={{
                width: '100%', background: scanning || !repoUrl.trim()
                  ? '#1a2233' : 'linear-gradient(135deg,#1f6feb,#3b5bdb)',
                border: 'none', color: scanning || !repoUrl.trim() ? '#3d4f6b' : '#fff',
                borderRadius: 6, padding: '7px', fontSize: '0.78rem', fontWeight: 600,
                cursor: scanning || !repoUrl.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {scanningRepo ? '⏳ Scanning…' : '🔍 Analyze'}
            </button>
            {scanSuccess && (
              <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: '#2ea043', lineHeight: 1.4 }}>
                {scanSuccess}
              </div>
            )}
            {scanError && (
              <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: '#f85149', lineHeight: 1.4 }}>
                {scanError}
              </div>
            )}
          </div>
        )}

        {/* Local scanner */}
        {sidebarOpen && (
          <div style={{ padding: '0.75rem 0.85rem', borderBottom: '1px solid #1e2738' }}>
            <div style={{ fontSize: '0.62rem', color: '#3d4f6b', letterSpacing: '0.09em',
              textTransform: 'uppercase', marginBottom: '0.45rem', fontWeight: 600 }}>
              Scan Local Path
            </div>
            <input
              type="text"
              placeholder={workspacePath ? `e.g. ${workspacePath}` : "e.g. C:\\projects\\my-app"}
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !scanning && void handleScanLocal()}
              disabled={scanning}
              style={{
                width: '100%', background: '#0d1420', border: '1px solid #1e2738',
                color: '#c9d1d9', borderRadius: 6, padding: '6px 9px',
                fontSize: '0.77rem', outline: 'none', marginBottom: '0.4rem',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={() => void handleScanLocal()}
              disabled={scanning || (!localPath.trim() && !workspacePath)}
              style={{
                width: '100%', background: scanning || (!localPath.trim() && !workspacePath)
                  ? '#1a2233' : 'linear-gradient(135deg,#1f6feb,#3b5bdb)',
                border: 'none', color: scanning || (!localPath.trim() && !workspacePath) ? '#3d4f6b' : '#fff',
                borderRadius: 6, padding: '7px', fontSize: '0.78rem', fontWeight: 600,
                cursor: scanning || (!localPath.trim() && !workspacePath) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {scanningLocal ? '⏳ Scanning…' : (localPath.trim() ? '📁 Analyze Local' : '📁 Analyze Workspace')}
            </button>
          </div>
        )}

        {/* Project picker */}
        {sidebarOpen && (
          <div style={{ padding: '0.75rem 0.85rem', borderBottom: '1px solid #1e2738' }}>
            <div style={{ fontSize: '0.62rem', color: '#3d4f6b', letterSpacing: '0.09em',
              textTransform: 'uppercase', marginBottom: '0.45rem', fontWeight: 600 }}>
              Active Project
            </div>
            {loadingProjects ? (
              <div style={{ fontSize: '0.78rem', color: '#3d4f6b' }}>Loading…</div>
            ) : projects.length === 0 ? (
              <div style={{ fontSize: '0.73rem', color: '#f85149', lineHeight: 1.5 }}>
                No scans yet.<br />
                <span style={{ color: '#3d4f6b' }}>Paste a GitHub link above ↑</span>
              </div>
            ) : (
              <select
                value={projectName}
                onChange={(e) => { setProjectName(e.target.value); setSelectedNode(null); }}
                style={{
                  width: '100%', background: '#0d1420', border: '1px solid #1e2738',
                  color: '#c9d1d9', borderRadius: 6, padding: '6px 9px',
                  fontSize: '0.8rem', cursor: 'pointer', outline: 'none',
                  boxSizing: 'border-box',
                }}
              >
                {projects.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>
        )}

        {/* Nav tabs */}
        <div style={{ flex: 1, padding: '0.4rem 0', overflowY: 'auto' }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                title={sidebarOpen ? '' : tab.label}
                style={{
                  width: '100%', background: active
                    ? 'linear-gradient(90deg,#1f6feb18,transparent)' : 'none',
                  border: 'none',
                  borderLeft: `3px solid ${active ? '#58a6ff' : 'transparent'}`,
                  color: active ? '#58a6ff' : '#4d6079',
                  padding: sidebarOpen ? '0.7rem 0.85rem' : '0.7rem 0',
                  textAlign: 'left', cursor: 'pointer',
                  fontSize: '0.83rem', fontWeight: active ? 600 : 400,
                  display: 'flex', alignItems: 'center',
                  gap: sidebarOpen ? '0.65rem' : 0,
                  justifyContent: sidebarOpen ? 'flex-start' : 'center',
                  transition: 'all 0.15s ease',
                }}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>{tab.icon}</span>
                {sidebarOpen && (
                  <div>
                    <div>{tab.label}</div>
                    <div style={{ fontSize: '0.67rem', color: active ? '#3a6fbd' : '#2d3d52',
                      marginTop: 1 }}>{tab.desc}</div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        {sidebarOpen && (
          <div style={{ padding: '0.6rem 0.85rem', borderTop: '1px solid #1e2738',
            fontSize: '0.65rem', color: '#2d3d52' }}>
            Powered by Neo4j · DepGraph v1.0
          </div>
        )}
      </nav>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        position: 'relative', background: '#080c12' }}>

        {/* Top bar */}
        <div style={{
          height: 50, flexShrink: 0, display: 'flex', alignItems: 'center',
          padding: '0 1.25rem', borderBottom: '1px solid #1e2738',
          background: '#0b111c', gap: '0.75rem',
        }}>
          {/* Breadcrumb */}
          <div style={{ fontSize: '0.8rem', color: '#3d4f6b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>⚡</span>
            <span style={{ color: '#2d3d52' }}>/</span>
            <span style={{ color: '#58a6ff', fontWeight: 600 }}>{projectName || '—'}</span>
            <span style={{ color: '#2d3d52' }}>/</span>
            <span>{TABS.find(t => t.id === activeTab)?.label}</span>
          </div>
          <div style={{ flex: 1 }} />
          {projectName && (
            <div style={{ fontSize: '0.72rem', color: '#2d3d52', background: '#0d1420',
              border: '1px solid #1e2738', borderRadius: 4, padding: '3px 8px' }}>
              📦 {projectName}
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
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
                  <DependencyGraph projectName={projectName} onNodeClick={setSelectedNode} />
                  {selectedNode && (
                    <PackageDetails node={selectedNode} onClose={() => setSelectedNode(null)} />
                  )}
                </div>
              )}
              {activeTab === 'vulnerabilities' && (
                <ScrollPanel>
                  <VulnerabilityPanel projectName={projectName} />
                </ScrollPanel>
              )}
              {activeTab === 'health' && (
                <ScrollPanel>
                  <HealthPanel projectName={projectName} />
                </ScrollPanel>
              )}
              {activeTab === 'zombies' && (
                <ScrollPanel>
                  <ZombiePanel projectName={projectName} />
                </ScrollPanel>
              )}
              {activeTab === 'duplicates' && (
                <ScrollPanel>
                  <DuplicatesPanel projectName={projectName} />
                </ScrollPanel>
              )}
            </>
          )}
        </div>
      </main>

      {/* Package.json Suggestion Modal */}
      {showPkgSuggest && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5, 8, 15, 0.85)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: '#0d1420', border: '1px solid #1e2738', borderRadius: 12,
            width: '90%', maxWidth: '600px', padding: '1.75rem',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)', display: 'flex',
            flexDirection: 'column', gap: '1rem'
          }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e6edf3', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⚠️ {suggestReason === 'missing_package_json' ? 'Missing package.json' : 'Invalid package.json'}
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#8b949e', margin: 0, lineHeight: 1.45 }}>
                DepGraph could not find a {suggestReason === 'missing_package_json' ? 'package.json' : 'valid package.json'} in <strong>{suggestedPath}</strong>.
                We scanned your folder's code files for library imports and created a suggested configuration template.
              </p>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4d6079', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.45rem' }}>
                Suggested package.json template
              </div>
              <pre style={{
                background: '#070a0f', border: '1px solid #1e2738', borderRadius: 8,
                padding: '1rem', overflowX: 'auto', fontSize: '0.78rem', color: '#a5d6ff',
                maxHeight: '220px', margin: 0, fontFamily: 'monospace'
              }}>
                <code>{suggestedContent}</code>
              </pre>
            </div>

            <div style={{ display: 'flex', justifySelf: 'flex-end', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                onClick={() => setShowPkgSuggest(false)}
                style={{
                  background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9',
                  borderRadius: 6, padding: '7px 14px', fontSize: '0.8rem', fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void handleInitPackageJson()}
                disabled={initializingPkg}
                style={{
                  background: 'linear-gradient(135deg, #1f6feb, #3b5bdb)', border: 'none', color: '#fff',
                  borderRadius: 6, padding: '7px 14px', fontSize: '0.8rem', fontWeight: 600,
                  cursor: initializingPkg ? 'not-allowed' : 'pointer'
                }}
              >
                {initializingPkg ? '⏳ Initializing…' : '📝 Create & Analyze'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScrollPanel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '1.5rem',
      background: '#080c12' }}>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', flexDirection: 'column', gap: '1.25rem', color: '#3d4f6b',
      userSelect: 'none' }}>
      <div style={{ fontSize: '4rem', filter: 'grayscale(0.3)' }}>⚡</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#4d6079' }}>
        No project selected
      </div>
      <div style={{ fontSize: '0.85rem', color: '#2d3d52', textAlign: 'center', maxWidth: 360 }}>
        Paste a GitHub repository link in the sidebar and click <strong style={{ color: '#3a6fbd' }}>Analyze</strong>,
        or run <code style={{ color: '#58a6ff', background: '#0d1420',
          padding: '2px 7px', borderRadius: 4 }}>depgraph scan /path/to/project</code> in the terminal.
      </div>
    </div>
  );
}
