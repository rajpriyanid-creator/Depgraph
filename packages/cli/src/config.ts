import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

export interface DepgraphConfig {
  neo4j?: {
    uri?: string;
    username?: string;
    password?: string;
  };
  scan?: {
    ecosystem?: string;
    ignore?: string[];
  };
}

export function loadConfig(projectPath: string): DepgraphConfig {
  const configPath = join(projectPath, '.depgraph.yml');
  if (!existsSync(configPath)) return {};
  try {
    return (yaml.load(readFileSync(configPath, 'utf-8')) as DepgraphConfig) ?? {};
  } catch {
    return {};
  }
}
