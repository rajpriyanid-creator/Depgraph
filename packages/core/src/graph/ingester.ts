import { runQuery } from './db.js';
import type { Scan } from '../normalization/models/index.js';

export interface NormalizedGraph {
  project: {
    path: string;
    name: string;
    version: string;
    ecosystem: string;
    scannedAt: string;
  };
  packages: Array<{
    id: string;
    name: string;
    version: string;
    ecosystem: string;
    isDirect: boolean;
    isTransitive: boolean;
    isRoot: boolean;
    scope: string;
    resolved?: string;
    integrity?: string;
    license?: string;
    description?: string;
  }>;
  edges: Array<{
    fromId: string;
    toId: string;
    type: string;
    scope: string;
  }>;
  scan: Scan;
}

const BATCH_SIZE = 500;

/**
 * Writes a normalized dependency graph into Neo4j.
 * All writes use MERGE so re-scans are idempotent.
 */
export class GraphIngester {
  async ingest(graph: NormalizedGraph): Promise<void> {
    console.log(`  🗄  Writing scan record…`);
    await this.writeScan(graph.scan);

    console.log(`  📦 Ingesting ${graph.packages.length} packages…`);
    await this.writePackages(graph);

    console.log(`  🔗 Creating ${graph.edges.length} edges…`);
    await this.writeEdges(graph);

    console.log(`  ✅ Ingestion complete.`);
  }

  private async writeScan(scan: Scan): Promise<void> {
    await runQuery(
      `MERGE (s:Scan {id: $id})
       SET s += {
         startedAt: $startedAt,
         projectName: $projectName,
         projectPath: $projectPath,
         packageCount: $packageCount,
         directCount: $directCount,
         transitiveCount: $transitiveCount,
         devCount: $devCount,
         enriched: $enriched
       }`,
      { ...scan },
    );
  }

  private async writePackages(graph: NormalizedGraph): Promise<void> {
    // Ensure the project node exists
    await runQuery(
      `MERGE (proj:Project {path: $path})
       SET proj += {name: $name, version: $version, ecosystem: $ecosystem, scannedAt: $scannedAt}`,
      { ...graph.project },
    );

    // Batch-write packages
    for (let i = 0; i < graph.packages.length; i += BATCH_SIZE) {
      const batch = graph.packages.slice(i, i + BATCH_SIZE);
      await runQuery(
        `UNWIND $packages AS pkg
         MERGE (p:Package {name: pkg.name, version: pkg.version, ecosystem: pkg.ecosystem})
         SET p += {
           id: pkg.id,
           isDirect: pkg.isDirect,
           isTransitive: pkg.isTransitive,
           isRoot: pkg.isRoot,
           scope: pkg.scope,
           resolved: pkg.resolved,
           integrity: pkg.integrity,
           license: pkg.license,
           description: pkg.description
         }`,
        { packages: batch },
      );
    }

    // Link scan → project
    await runQuery(
      `MATCH (s:Scan {id: $scanId}), (proj:Project {path: $projectPath})
       MERGE (s)-[:SCANNED]->(proj)`,
      { scanId: graph.scan.id, projectPath: graph.project.path },
    );

    // Link project → root package
    const rootPkg = graph.packages.find((p) => p.isRoot);
    if (rootPkg) {
      await runQuery(
        `MATCH (proj:Project {path: $projectPath}), (p:Package {name: $name, version: $version, ecosystem: $ecosystem})
         MERGE (proj)-[:ROOT_PACKAGE]->(p)`,
        {
          projectPath: graph.project.path,
          name: rootPkg.name,
          version: rootPkg.version,
          ecosystem: rootPkg.ecosystem,
        },
      );
    }
  }

  private async writeEdges(graph: NormalizedGraph): Promise<void> {
    // Separate project-root edges from package-package edges
    const projectEdges = graph.edges.filter((e) => e.fromId === graph.project.path);
    const pkgEdges = graph.edges.filter((e) => e.fromId !== graph.project.path);

    if (projectEdges.length > 0) {
      for (let i = 0; i < projectEdges.length; i += BATCH_SIZE) {
        const batch = projectEdges.slice(i, i + BATCH_SIZE);
        await runQuery(
          `UNWIND $edges AS edge
           MATCH (src:Project {path: edge.fromId})
           MATCH (dst:Package {id: edge.toId})
           MERGE (src)-[r:DEPENDS_ON]->(dst)
           SET r.type = edge.type, r.scope = edge.scope`,
          { edges: batch },
        );
      }
    }

    for (let i = 0; i < pkgEdges.length; i += BATCH_SIZE) {
      const batch = pkgEdges.slice(i, i + BATCH_SIZE);
      await runQuery(
        `UNWIND $edges AS edge
         MATCH (src:Package {id: edge.fromId})
         MATCH (dst:Package {id: edge.toId})
         MERGE (src)-[r:DEPENDS_ON]->(dst)
         SET r.type = edge.type, r.scope = edge.scope`,
        { edges: batch },
      );
    }
  }
}
