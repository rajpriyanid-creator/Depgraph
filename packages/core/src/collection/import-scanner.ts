import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

export interface ImportEntry {
  count: number;
  files: string[];
}

export type ImportMap = Record<string, ImportEntry>;

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'coverage',
  '.turbo',
  '.next',
  '.nuxt',
  'out',
  '__pycache__',
  '.venv',
  'venv',
  'target',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);

// Matches: import X from 'pkg', import { X } from 'pkg', import 'pkg'
const STATIC_IMPORT_RE =
  /(?:import\s+(?:[^'"]*\s+from\s+)?|export\s+(?:[^'"]*\s+from\s+))['"]([^'"]+)['"]/g;

// Matches: require('pkg')
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

// Matches: import('pkg')
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Extracts the npm package name from an import path.
 * '@scope/pkg/sub' → '@scope/pkg'
 * 'pkg/sub/file' → 'pkg'
 * './local' → null (relative, skip)
 */
function extractPackageName(importPath: string): string | null {
  if (importPath.startsWith('.') || importPath.startsWith('/')) return null;
  if (importPath.startsWith('node:')) return null; // Node built-ins

  if (importPath.startsWith('@')) {
    const parts = importPath.split('/');
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return `${parts[0]}/${parts[1]}`;
    }
    return null;
  }

  return importPath.split('/')[0] ?? null;
}

/**
 * Recursively walk source files and collect all import statements.
 */
export async function scanImports(projectPath: string): Promise<ImportMap> {
  const importMap: ImportMap = {};

  function processFile(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const allImports: string[] = [];

      for (const re of [STATIC_IMPORT_RE, REQUIRE_RE, DYNAMIC_IMPORT_RE]) {
        re.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(content)) !== null) {
          const importPath = match[1];
          if (importPath) allImports.push(importPath);
        }
      }

      for (const importPath of allImports) {
        const pkg = extractPackageName(importPath);
        if (!pkg) continue;
        if (!importMap[pkg]) {
          importMap[pkg] = { count: 0, files: [] };
        }
        importMap[pkg]!.count += 1;
        if (!importMap[pkg]!.files.includes(filePath)) {
          importMap[pkg]!.files.push(filePath);
        }
      }
    } catch {
      // silently skip unreadable files
    }
  }

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (SOURCE_EXTENSIONS.has(extname(entry))) {
          processFile(fullPath);
        }
      } catch {
        // skip
      }
    }
  }

  // Try src/ first, fall back to project root
  const srcDir = join(projectPath, 'src');
  try {
    statSync(srcDir);
    walk(srcDir);
  } catch {
    walk(projectPath);
  }

  return importMap;
}
