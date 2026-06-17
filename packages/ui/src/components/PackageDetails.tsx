import type { GraphNode } from './DependencyGraph.js';

interface PackageDetailsProps {
  node: GraphNode | null;
  onClose: () => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ff4444',
  high: '#ff8800',
  medium: '#ffcc00',
  low: '#4488ff',
};

const HEALTH_COLORS: Record<string, string> = {
  healthy: '#2ea043',
  watch: '#d29922',
  caution: '#f78166',
  risky: '#f85149',
};

export function PackageDetails({ node, onClose }: PackageDetailsProps) {
  if (!node) return null;

  const healthColor = HEALTH_COLORS[node.healthLabel ?? 'watch'] ?? '#888';
  const severityColor = SEVERITY_COLORS[node.cveSeverity ?? ''] ?? 'transparent';

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 380,
      background: '#161b22', borderLeft: '1px solid #30363d',
      padding: '1.5rem', overflowY: 'auto', zIndex: 100,
      display: 'flex', flexDirection: 'column', gap: '1.25rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e6edf3' }}>{node.name}</div>
          <div style={{ fontSize: '0.85rem', color: '#8b949e' }}>v{node.version}</div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#8b949e',
          fontSize: '1.2rem', cursor: 'pointer', padding: '0 0.25rem',
        }}>✕</button>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {node.isDirect && (
          <span style={{ background: '#1f6feb', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: '0.75rem' }}>
            direct
          </span>
        )}
        {!node.isDirect && (
          <span style={{ background: '#30363d', color: '#8b949e', borderRadius: 4, padding: '2px 8px', fontSize: '0.75rem' }}>
            transitive
          </span>
        )}
        {node.scope && (
          <span style={{ background: '#21262d', color: '#8b949e', borderRadius: 4, padding: '2px 8px', fontSize: '0.75rem' }}>
            {node.scope}
          </span>
        )}
      </div>

      {/* Health */}
      {node.healthScore !== undefined && (
        <Section title="Health">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              border: `3px solid ${healthColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem', fontWeight: 700, color: healthColor,
            }}>
              {node.healthScore}
            </div>
            <div>
              <div style={{ color: healthColor, fontWeight: 600, textTransform: 'capitalize' }}>
                {node.healthLabel ?? 'unknown'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#8b949e' }}>Health score / 100</div>
            </div>
          </div>
        </Section>
      )}

      {/* Security */}
      {node.cveSeverity && (
        <Section title="Security">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              background: severityColor, color: '#fff', borderRadius: 4,
              padding: '2px 10px', fontSize: '0.8rem', fontWeight: 700,
              textTransform: 'uppercase',
            }}>
              {node.cveSeverity}
            </span>
            <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>
              Known vulnerability
            </span>
          </div>
          {node.cveIds && node.cveIds.length > 0 && (
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {node.cveIds.map((id) => (
                <a key={id} href={`https://osv.dev/vulnerability/${id}`} target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#58a6ff', fontSize: '0.8rem', textDecoration: 'none' }}>
                  {id} ↗
                </a>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Links */}
      <Section title="Registry">
        <a href={`https://www.npmjs.com/package/${node.name}`} target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#58a6ff', fontSize: '0.85rem', textDecoration: 'none' }}>
          View on npm ↗
        </a>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#8b949e',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem',
        borderBottom: '1px solid #21262d', paddingBottom: '0.25rem' }}>
        {title}
      </div>
      {children}
    </div>
  );
}
