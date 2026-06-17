import { useState, useEffect } from 'react';

interface ZombieEntry {
  name: string; version: string; size?: number;
  classification: string; installedDays?: number;
}

const CLS: Record<string, { label: string; color: string; icon: string; bg: string }> = {
  definitelyUnused: { label: 'Definitely unused', color: '#ef4444', icon: '🧟', bg: '#ef444418' },
  scriptOnly:       { label: 'Script/tooling',    color: '#eab308', icon: '🔧', bg: '#eab30818' },
  typeOnly:         { label: 'Types only',        color: '#3b82f6', icon: '📝', bg: '#3b82f618' },
  ambiguous:        { label: 'Possibly unused',   color: '#6b7280', icon: '❓', bg: '#6b728018' },
};

function fmt(b?: number) {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

export function ZombiePanel({ projectName }: { projectName: string }) {
  const [zombies, setZombies] = useState<ZombieEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/zombies/${encodeURIComponent(projectName)}`)
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then(setZombies).catch((e) => setError(String(e))).finally(() => setLoading(false));
  }, [projectName]);

  if (loading) return <Spinner label="Scanning for unused packages…" />;
  if (error)   return <Err msg={error} />;

  const definite    = zombies.filter((z) => z.classification === 'definitelyUnused');
  const wastedBytes = definite.reduce((s, z) => s + (z.size ?? 0), 0);

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#e6edf3', margin: '0 0 4px' }}>
          🧟 Zombie Packages
        </h2>
        <p style={{ fontSize: '0.78rem', color: '#4d6079', margin: 0 }}>
          Dependencies declared but not detected in source imports
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.6rem',
        marginBottom: '1.25rem' }}>
        {Object.entries(CLS).map(([key, c]) => {
          const cnt = zombies.filter((z) => z.classification === key).length;
          return (
            <div key={key} style={{ background: '#0d1420', border: `1px solid ${c.color}33`,
              borderRadius: 10, padding: '0.75rem 0.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: cnt > 0 ? c.color : '#2d3d52' }}>
                {cnt}
              </div>
              <div style={{ fontSize: '0.67rem', color: '#4d6079', marginTop: 2,
                textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {c.icon} {c.label}
              </div>
            </div>
          );
        })}
      </div>

      {zombies.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem',
          background: '#0d1420', borderRadius: 12, border: '1px solid #1e2738' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
          <div style={{ fontWeight: 600, color: '#22c55e' }}>No zombie packages detected</div>
          <div style={{ fontSize: '0.8rem', color: '#2d3d52', marginTop: 4 }}>
            All dependencies appear to be used
          </div>
        </div>
      ) : (
        <>
          {/* Alert banner */}
          {definite.length > 0 && (
            <div style={{ background: '#ef444412', border: '1px solid #ef444430',
              borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, color: '#ef4444' }}>
                {definite.length} package{definite.length !== 1 ? 's' : ''} appear unused
              </div>
              {wastedBytes > 0 && (
                <div style={{ fontSize: '0.78rem', color: '#4d6079', marginTop: 2 }}>
                  ~{fmt(wastedBytes)} potentially removable
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {zombies.map((z) => {
              const c = CLS[z.classification] ?? CLS.ambiguous!;
              return (
                <div key={`${z.name}@${z.version}`} style={{
                  background: '#0d1420', border: `1px solid ${c.color}22`,
                  borderLeft: `3px solid ${c.color}`, borderRadius: 10,
                  padding: '0.8rem 1rem', display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, color: '#e6edf3', fontSize: '0.875rem' }}>
                        {z.name}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#2d3d52' }}>v{z.version}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.74rem', color: c.color,
                        background: c.bg, borderRadius: 4, padding: '2px 7px' }}>
                        {c.icon} {c.label}
                      </span>
                      {z.installedDays !== undefined && (
                        <span style={{ fontSize: '0.7rem', color: '#2d3d52' }}>
                          ~{z.installedDays}d old
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.8rem', color: '#4d6079', fontWeight: 600 }}>
                      {fmt(z.size)}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#2d3d52', marginTop: 1 }}>gzipped</div>
                  </div>
                </div>
              );
            })}

            {/* Remove command */}
            {definite.length > 0 && (
              <div style={{ marginTop: '0.75rem', background: '#0d1420',
                border: '1px solid #1e2738', borderRadius: 10, padding: '0.85rem 1rem' }}>
                <div style={{ fontSize: '0.73rem', color: '#4d6079', marginBottom: '0.4rem' }}>
                  Remove definitely-unused packages:
                </div>
                <code style={{ display: 'block', background: '#080c12', borderRadius: 6,
                  padding: '0.5rem 0.75rem', fontSize: '0.79rem', color: '#58a6ff',
                  overflowX: 'auto', whiteSpace: 'pre', border: '1px solid #1e2738' }}>
                  {`npm uninstall ${definite.map((z) => z.name).join(' ')}`}
                </code>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: 220, color: '#3d4f6b', gap: '0.6rem', fontSize: '0.88rem' }}>
      ⏳ {label}
    </div>
  );
}
function Err({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '1.25rem', color: '#ef4444', fontSize: '0.83rem',
      background: '#ef444412', borderRadius: 8, border: '1px solid #ef444430' }}>
      ⚠ {msg}
    </div>
  );
}
