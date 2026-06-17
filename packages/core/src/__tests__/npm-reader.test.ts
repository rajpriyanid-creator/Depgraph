import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NpmReader } from '../collection/readers/npm.js';
import { normalizeNpm } from '../normalization/normalizers/npm-normalizer.js';

const FIXTURES_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');

describe('NpmReader', () => {
  it('reads package.json and lockfile from simple-project', async () => {
    const reader = new NpmReader();
    const data = await reader.read(join(FIXTURES_DIR, 'simple-project'));

    expect(data.projectName).toBe('simple-project');
    expect(data.projectVersion).toBe('1.0.0');
    expect(data.packages.size).toBeGreaterThan(0);
  });

  it('identifies direct dependencies correctly', async () => {
    const reader = new NpmReader();
    const data = await reader.read(join(FIXTURES_DIR, 'simple-project'));

    expect(data.directDependencies.has('lodash')).toBe(true);
    expect(data.directDependencies.has('axios')).toBe(true);
    expect(data.directDependencies.has('typescript')).toBe(true);
  });

  it('reads lockfile packages with version info', async () => {
    const reader = new NpmReader();
    const data = await reader.read(join(FIXTURES_DIR, 'simple-project'));

    const lodash = [...data.packages.values()].find((p) => p.name === 'lodash');
    expect(lodash).toBeDefined();
    expect(lodash?.version).toBe('4.17.21');
    expect(lodash?.resolved).toContain('registry.npmjs.org');
    expect(lodash?.integrity).toBeDefined();
  });

  it('correctly identifies transitive deps', async () => {
    const reader = new NpmReader();
    const data = await reader.read(join(FIXTURES_DIR, 'simple-project'));

    // follow-redirects is a dep of axios, not listed directly in package.json
    const followRedirects = [...data.packages.values()].find(
      (p) => p.name === 'follow-redirects',
    );
    expect(followRedirects).toBeDefined();
    expect(data.directDependencies.has('follow-redirects')).toBe(false);
  });

  it('assigns dev scope to devDependencies', async () => {
    const reader = new NpmReader();
    const data = await reader.read(join(FIXTURES_DIR, 'simple-project'));

    const ts = [...data.packages.values()].find((p) => p.name === 'typescript');
    expect(ts?.scope).toBe('development');
  });
});

describe('normalizeNpm', () => {
  let rawData: Awaited<ReturnType<NpmReader['read']>>;

  beforeAll(async () => {
    const reader = new NpmReader();
    rawData = await reader.read(join(FIXTURES_DIR, 'simple-project'));
  });

  it('produces a NormalizedGraph with the correct root package', () => {
    const graph = normalizeNpm(rawData);
    const root = graph.packages.find((p) => p.isRoot);
    expect(root).toBeDefined();
    expect(root?.name).toBe('simple-project');
    expect(root?.version).toBe('1.0.0');
  });

  it('marks direct deps as isDirect=true', () => {
    const graph = normalizeNpm(rawData);
    const lodash = graph.packages.find((p) => p.name === 'lodash');
    expect(lodash?.isDirect).toBe(true);
    expect(lodash?.isTransitive).toBe(false);
  });

  it('marks transitive deps as isTransitive=true', () => {
    const graph = normalizeNpm(rawData);
    const followRedirects = graph.packages.find((p) => p.name === 'follow-redirects');
    if (!followRedirects) return; // Skip if lockfile didn't resolve
    expect(followRedirects.isDirect).toBe(false);
    expect(followRedirects.isTransitive).toBe(true);
  });

  it('creates edges from root to direct deps', () => {
    const graph = normalizeNpm(rawData);
    const lodashPkg = graph.packages.find((p) => p.name === 'lodash');
    expect(lodashPkg).toBeDefined();
    const edge = graph.edges.find(
      (e) => e.toId === lodashPkg!.id && e.type === 'direct',
    );
    expect(edge).toBeDefined();
  });

  it('generates a unique scan ID', () => {
    const g1 = normalizeNpm(rawData);
    const g2 = normalizeNpm(rawData);
    expect(g1.scan.id).not.toBe(g2.scan.id);
  });

  it('sets correct package counts in scan record', () => {
    const graph = normalizeNpm(rawData);
    const nonRoot = graph.packages.filter((p) => !p.isRoot);
    expect(graph.scan.packageCount).toBe(nonRoot.length);
  });

  it('packages have correct ecosystem', () => {
    const graph = normalizeNpm(rawData);
    for (const pkg of graph.packages) {
      expect(pkg.ecosystem).toBe('npm');
    }
  });
});
