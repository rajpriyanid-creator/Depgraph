import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanImports } from '../collection/import-scanner.js';

function makeTempProject(): string {
  return mkdtempSync(join(tmpdir(), 'depgraph-test-'));
}

describe('scanImports', () => {
  it('detects static ESM imports', async () => {
    const dir = makeTempProject();
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, 'index.ts'), `
      import lodash from 'lodash';
      import { debounce } from 'lodash';
      import axios from 'axios';
    `);

    const result = await scanImports(dir);
    expect(result['lodash']?.count).toBeGreaterThanOrEqual(2);
    expect(result['axios']?.count).toBeGreaterThanOrEqual(1);
  });

  it('detects require calls', async () => {
    const dir = makeTempProject();
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, 'index.js'), `
      const lodash = require('lodash');
      const path = require('path');
    `);

    const result = await scanImports(dir);
    expect(result['lodash']).toBeDefined();
    // 'path' is a Node built-in — not filtered unless prefixed with node:
    // (The scanner filters 'node:path' but not bare 'path')
    // Behavior is acceptable — 'path' without 'node:' prefix will be included
  });

  it('detects dynamic imports', async () => {
    const dir = makeTempProject();
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, 'lazy.ts'), `
      const module = await import('some-lazy-module');
    `);

    const result = await scanImports(dir);
    expect(result['some-lazy-module']).toBeDefined();
  });

  it('ignores relative imports', async () => {
    const dir = makeTempProject();
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, 'index.ts'), `
      import { foo } from './utils';
      import { bar } from '../shared/helpers';
    `);

    const result = await scanImports(dir);
    expect(result['./utils']).toBeUndefined();
    expect(result['../shared/helpers']).toBeUndefined();
  });

  it('handles scoped packages correctly', async () => {
    const dir = makeTempProject();
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, 'index.ts'), `
      import { something } from '@scope/package';
      import { deep } from '@scope/package/deep/path';
    `);

    const result = await scanImports(dir);
    expect(result['@scope/package']?.count).toBeGreaterThanOrEqual(2);
    // Deep import should resolve to the same package
    expect(result['@scope/package/deep/path']).toBeUndefined();
  });

  it('ignores node: builtins', async () => {
    const dir = makeTempProject();
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, 'index.ts'), `
      import { readFile } from 'node:fs';
      import { join } from 'node:path';
      import axios from 'axios';
    `);

    const result = await scanImports(dir);
    expect(result['node:fs']).toBeUndefined();
    expect(result['node:path']).toBeUndefined();
    expect(result['axios']).toBeDefined();
  });

  it('returns empty map for empty project', async () => {
    const dir = makeTempProject();
    mkdirSync(join(dir, 'src'));
    const result = await scanImports(dir);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('skips node_modules directory', async () => {
    const dir = makeTempProject();
    const nmDir = join(dir, 'node_modules', 'some-pkg');
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, 'index.js'), `
      import malicious from 'malicious';
    `);
    mkdirSync(join(dir, 'src'));
    const result = await scanImports(dir);
    expect(result['malicious']).toBeUndefined();
  });
});
