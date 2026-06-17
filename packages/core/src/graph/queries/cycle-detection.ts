import { runReadQuery } from '../db.js';

export interface Cycle {
  packages: string[];
  length: number;
  severity: 'high' | 'medium' | 'low';
  suggestedBreakPoint: string;
}

export async function detectCycles(projectName: string): Promise<Cycle[]> {
  // Note: Neo4j does not allow variable-length relationships in MATCH that form a cycle
  // We use a fixed-depth approach and filter for cycles
  const rows = await runReadQuery<{
    cycle: string[];
    len: number;
    breakPoint: string;
  }>(
    `MATCH path = (p:Package)-[:DEPENDS_ON*2..10]->(p)
     WHERE ANY(n IN nodes(path) WHERE EXISTS {
       MATCH (root:Package {isRoot: true, name: $projectName})-[:DEPENDS_ON*]->(n)
     })
     WITH [n IN nodes(path) | n.name + '@' + n.version] AS cycle,
          length(path) AS len,
          nodes(path) AS pkgNodes
     WITH DISTINCT cycle, len, pkgNodes
     WITH cycle, len,
          [n IN pkgNodes | {name: n.name + '@' + n.version, deps: size([(n)-[:DEPENDS_ON]->() | 1])}] AS withDeps
     WITH cycle, len,
          reduce(bp = withDeps[0], x IN withDeps | CASE WHEN x.deps < bp.deps THEN x ELSE bp END).name AS breakPoint
     RETURN cycle, len, breakPoint
     ORDER BY len ASC
     LIMIT 50`,
    { projectName },
  );

  return rows.map((row) => ({
    packages: row.cycle,
    length: row.len,
    severity: row.len === 2 ? 'high' : row.len <= 5 ? 'medium' : 'low',
    suggestedBreakPoint: row.breakPoint,
  }));
}
