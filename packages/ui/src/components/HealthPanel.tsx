import { useState, useEffect, useCallback } from 'react';

interface HealthEntry { name: string; version: string; score: number; label: string; }
interface HealthPanelProps { projectName: string; }

const LABEL_COLORS: Record<string, string> = {
  healthy: '#22c55e', watch: '#eab308', caution: '#f97316', risky: '#ef4444',
};
const LABEL_ICONS: Record<string, string> = {
  healthy: '✅', watch: '👀', caution: '⚠️', risky: '🔴',
};
const LABEL_BG: Record<string, string> = {
  healthy: '#22c55e18', watch: '#eab30818', caution: '#f9731618', risky: '#ef444418',
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444';
  return (
    <div style={{ height: 5, background: '#1e2738', borderRadius: 3, width: '100%', overflow: 'hidden', marginTop: 8 }}>
      <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 3,
        transition: 'width 0.5s ease', boxShadow: `0 0 6px ${color}66` }} />
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444';
  const r = 16, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
      <circle cx={20} cy={20} r={r} fill="none" stroke="#1e2738" strokeWidth={4} />
      <circle cx={20} cy={20} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 20 20)" style={{ transition: 'stroke-dasharray 0.5s ease' }} />
      <text x={20} y={24} textAnchor="middle" fill={color} fontSize={11} fontWeight={700}>
        {score}
      </text>
    </svg>
  );
}

export function HealthPanel({ projectName }: HealthPanelProps) {
  const [entries,     setEntries]     = useState<HealthEntry[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [computing,   setComputing]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [labelFilter, setLabelFilter] = useState('all');

  const fetchHealth = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`/api/health/${encodeURIComponent(projectName)}`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      setEntries(await res.json() as HealthEntry[]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  useEffect(() => { void fetchHealth(); }, [fetchHealth]);

  const handleCompute = async () => {
    setComputing(true); setError(null);
    try {
      const res  = await fetch(`/api/health-compute/${encodeURIComponent(projectName)}`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? `API ${res.status}`);
      }
      await fetchHealth();
    } catch (e) {
      setError(String(e));
    } finally {
      setComputing(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: 200, color: '#3d4f6b', gap: '0.5rem', fontSize: '0.9rem' }}>
      <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
      Loading health data…
    </div>
  );

  if (error) return (
    <div style={{ padding: '1.5rem', color: '#ef4444', fontSize: '0.85rem',
      background: '#ef444410', borderRadius: 8, border: '1px solid #ef444430' }}>
      ⚠ {error}
    </div>
  );

  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.label] = (counts[e.label] ?? 0) + 1;
  const filtered = labelFilter === 'all' ? entries : entries.filter((e) => e.label === labelFilter);

  const avgScore = entries.length
    ? Math.round(entries.reduce((s, e) => s + e.score, 0) / entries.length)
    : null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#e6edf3', margin: 0 }}>
            💚 Package Health
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#4d6079', margin: '4px 0 0' }}>
            Quality scores based on recency, maintainers, and download trends
          </p>
        </div>
        <button onClick={() => void handleCompute()} disabled={computing}
          style={{
            background: computing ? '#1a2233' : 'linear-gradient(135deg,#1f6feb,#6366f1)',
            border: 'none', color: computing ? '#3d4f6b' : '#fff',
            borderRadius: 8, padding: '8px 16px', fontSize: '0.82rem', fontWeight: 600,
            cursor: computing ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
            boxShadow: computing ? 'none' : '0 2px 12px #1f6feb44',
          }}>
          {computing ? '⏳ Computing…' : '⚡ Compute Health Scores'}
        </button>
      </div>

      {/* Summary cards */}
      {entries.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '0.6rem',
          marginBottom: '1.25rem' }}>
          {[
            { key: 'avg',     label: 'Avg Score', value: avgScore ?? '—',   color: '#6366f1' },
            { key: 'healthy', label: 'Healthy',   value: counts.healthy ?? 0, color: '#22c55e' },
            { key: 'watch',   label: 'Watch',     value: counts.watch   ?? 0, color: '#eab308' },
            { key: 'caution', label: 'Caution',   value: counts.caution ?? 0, color: '#f97316' },
            { key: 'risky',   label: 'Risky',     value: counts.risky   ?? 0, color: '#ef4444' },
          ].map(({ key, label, value, color }) => (
            <div key={key} style={{
              background: '#0d1420', border: `1px solid ${color}33`,
              borderRadius: 10, padding: '0.75rem', textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: '0.68rem', color: '#4d6079', marginTop: 2,
                textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3.5rem 1rem',
          background: '#0d1420', borderRadius: 12, border: '1px solid #1e2738' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📊</div>
          <div style={{ fontWeight: 600, color: '#4d6079', marginBottom: '0.5rem' }}>
            No health data yet
          </div>
          <div style={{ fontSize: '0.82rem', color: '#2d3d52', marginBottom: '1.25rem' }}>
            Click <strong style={{ color: '#6366f1' }}>Compute Health Scores</strong> above to
            analyse this project's packages via the npm registry.
          </div>
          <button onClick={() => void handleCompute()} disabled={computing}
            style={{
              background: 'linear-gradient(135deg,#1f6feb,#6366f1)',
              border: 'none', color: '#fff', borderRadius: 8, padding: '10px 22px',
              fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 2px 16px #1f6feb44',
            }}>
            {computing ? '⏳ Computing…' : '⚡ Run Now'}
          </button>
        </div>
      ) : (
        <>
          {/* Filter pills */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {['all', 'risky', 'caution', 'watch', 'healthy'].map((lbl) => {
              const count = lbl === 'all' ? entries.length : (counts[lbl] ?? 0);
              const color = lbl === 'all' ? '#6366f1' : (LABEL_COLORS[lbl] ?? '#888');
              const active = labelFilter === lbl;
              return (
                <button key={lbl} onClick={() => setLabelFilter(lbl)}
                  style={{
                    background: active ? LABEL_BG[lbl] ?? '#6366f118' : '#0d1420',
                    border: `1px solid ${active ? color : '#1e2738'}`,
                    color: active ? color : '#4d6079',
                    borderRadius: 20, padding: '5px 14px', fontSize: '0.78rem',
                    cursor: 'pointer', fontWeight: active ? 600 : 400, transition: 'all 0.15s',
                  }}>
                  {lbl === 'all' ? 'All' : LABEL_ICONS[lbl]} {lbl} ({count})
                </button>
              );
            })}
          </div>

          {/* Package list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {filtered.map((e) => {
              const color = LABEL_COLORS[e.label] ?? '#888';
              return (
                <div key={`${e.name}@${e.version}`} style={{
                  background: '#0d1420', border: '1px solid #1e2738',
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 10, padding: '0.85rem 1rem',
                  display: 'flex', alignItems: 'center', gap: '1rem',
                }}>
                  <ScoreRing score={e.score} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, color: '#e6edf3', fontSize: '0.875rem',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.name}
                      </span>
                      <span style={{ fontSize: '0.72rem', color, fontWeight: 600,
                        textTransform: 'capitalize', flexShrink: 0, marginLeft: '0.5rem',
                        background: LABEL_BG[e.label] ?? '#0', borderRadius: 4, padding: '2px 7px' }}>
                        {LABEL_ICONS[e.label]} {e.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#2d3d52', marginBottom: 4 }}>
                      v{e.version}
                    </div>
                    <ScoreBar score={e.score} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
