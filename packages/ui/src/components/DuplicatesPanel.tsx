import { useState, useEffect } from 'react';

interface DuplicateGroup {
  name: string; allVersions: string[]; severity: string;
  versionDetails: Array<{ version: string; bundleSize?: number; requiredBy: string[] }>;
  totalWastedBytes: number; canDeduplicate: boolean; safeVersion?: string;
}

const SEV_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308',
};
const SEV_BG: Record<string, string> = {
  critical: '#ef444418', high: '#f9731618', medium: '#eab30818',
};

function fmt(b: number) {
  if (b === 0) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

export function DuplicatesPanel({ projectName }: { projectName: string }) {
  const [dupes,   setDupes]   = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [expanded,setExpanded]= useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/duplicates/${encodeURIComponent(projectName)}`)
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then(setDupes).catch((e) => setError(String(e))).finally(() => setLoading(false));
  }, [projectName]);

  if (loading) return <Spinner label="Finding duplicate packages…" />;
  if (error)   return <Err msg={error} />;

  const totalWasted = dupes.reduce((s, d) => s + d.totalWastedBytes, 0);
  const canDedup    = dupes.filter((d) => d.canDeduplicate).length;

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#e6edf3', margin: '0 0 4px' }}>
          🔁 Duplicate Packages
        </h2>
        <p style={{ fontSize: '0.78rem', color: '#4d6079', margin: 0 }}>
          Multiple versions of the same package installed in your dependency tree
        </p>
      </div>

      {/* Stats */}
      {dupes.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.6rem',
          marginBottom: '1.25rem' }}>
          {[
            { label: 'Duplicates',   value: dupes.length,  color: '#eab308' },
            { label: 'Deduplicable', value: canDedup,      color: '#22c55e' },
            { label: 'Wasted Size',  value: fmt(totalWasted), color: '#f97316' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#0d1420', border: `1px solid ${color}33`,
              borderRadius: 10, padding: '0.85rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: '0.68rem', color: '#4d6079', marginTop: 2,
                textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {dupes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem',
          background: '#0d1420', borderRadius: 12, border: '1px solid #1e2738' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
          <div style={{ fontWeight: 600, color: '#22c55e' }}>No duplicate packages found</div>
          <div style={{ fontSize: '0.8rem', color: '#2d3d52', marginTop: 4 }}>
            All packages are at single versions
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {dupes.map((d) => {
            const color = SEV_COLORS[d.severity] ?? '#eab308';
            const open  = expanded === d.name;
            return (
              <div key={d.name} style={{
                background: '#0d1420', border: `1px solid ${color}33`,
                borderLeft: `3px solid ${color}`, borderRadius: 10, overflow: 'hidden',
                boxShadow: open ? `0 4px 16px ${color}18` : 'none', transition: 'box-shadow 0.15s',
              }}>
                <button onClick={() => setExpanded(open ? null : d.name)}
                  style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                    padding: '0.9rem 1rem', display: 'flex', alignItems: 'center',
                    gap: '0.75rem', textAlign: 'left' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#e6edf3', fontSize: '0.875rem', marginBottom: 3 }}>
                      {d.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#4d6079' }}>
                      {d.allVersions.join(' · ')}
                      {d.totalWastedBytes > 0 && (
                        <span style={{ color: '#f97316', marginLeft: 6 }}>
                          · {fmt(d.totalWastedBytes)} wasted
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ background: SEV_BG[d.severity] ?? '#eab30818', color,
                    borderRadius: 5, padding: '3px 9px', fontSize: '0.7rem', fontWeight: 700,
                    textTransform: 'uppercase', flexShrink: 0 }}>
                    {d.severity}
                  </span>
                  <span style={{ color: '#2d3d52', fontSize: '0.75rem' }}>
                    {open ? '▲' : '▼'}
                  </span>
                </button>

                {open && (
                  <div style={{ padding: '0 1rem 0.9rem', borderTop: '1px solid #1e2738' }}>
                    {d.versionDetails.map((v) => (
                      <div key={v.version} style={{ marginTop: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#3b82f6' }}>
                            v{v.version}
                          </span>
                          {v.bundleSize && (
                            <span style={{ fontSize: '0.73rem', color: '#4d6079' }}>
                              {fmt(v.bundleSize)}
                            </span>
                          )}
                        </div>
                        {v.requiredBy.length > 0 && (
                          <div style={{ fontSize: '0.73rem', color: '#3d4f6b', lineHeight: 1.5 }}>
                            Required by:{' '}
                            {v.requiredBy.slice(0, 4).join(', ')}
                            {v.requiredBy.length > 4 && (
                              <span style={{ color: '#2d3d52' }}> +{v.requiredBy.length - 4} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}

                    {d.safeVersion && (
                      <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem',
                        background: '#22c55e18', border: '1px solid #22c55e33',
                        borderRadius: 6, fontSize: '0.8rem', color: '#22c55e' }}>
                        ✅ Safe to deduplicate to v{d.safeVersion}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
