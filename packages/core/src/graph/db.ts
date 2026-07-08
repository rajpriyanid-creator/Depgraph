import neo4j, { type Driver, type Record as Neo4jRecord } from 'neo4j-driver';
import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const CONFIG_PATH = join(process.cwd(), '.depgraph-db.json');

interface DbConfig {
  uri?: string;
  username?: string;
  password?: string;
}

let activeConfig: DbConfig | null = null;

function loadConfig(): DbConfig | null {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(raw) as DbConfig;
    }
  } catch {
    // ignore
  }
  return null;
}

let driverInstance: Driver | null = null;

/**
 * Returns the singleton Neo4j driver instance.
 * Creates it on first call using environment variables or config.
 */
export function getDriver(uri?: string, username?: string, password?: string): Driver {
  if (!driverInstance) {
    const config = activeConfig || loadConfig() || {};
    const activeUri = uri ?? config.uri ?? process.env['NEO4J_URI'] ?? 'bolt://localhost:7687';
    const activeUser = username ?? config.username ?? process.env['NEO4J_USERNAME'] ?? 'neo4j';
    const activePass = password ?? config.password ?? process.env['NEO4J_PASSWORD'] ?? 'depgraph';

    driverInstance = neo4j.driver(
      activeUri,
      neo4j.auth.basic(activeUser, activePass),
      {
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 10_000,
        logging: neo4j.logging.console('warn'),
      },
    );
  }
  return driverInstance;
}

/**
 * Closes the singleton driver and clears the instance.
 */
export async function closeDriver(): Promise<void> {
  if (driverInstance) {
    await driverInstance.close();
    driverInstance = null;
  }
}

/**
 * Execute a Cypher query and return an array of plain JavaScript objects.
 */
export async function runQuery<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((record: Neo4jRecord) => recordToObject<T>(record));
  } finally {
    await session.close();
  }
}

/**
 * Execute a read-only Cypher query.
 */
export async function runReadQuery<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((record: Neo4jRecord) => recordToObject<T>(record));
  } finally {
    await session.close();
  }
}

/**
 * Execute multiple queries in a single write transaction.
 */
export async function runTransaction(
  queries: Array<{ cypher: string; params: Record<string, unknown> }>,
): Promise<void> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  const tx = session.beginTransaction();
  try {
    for (const { cypher, params } of queries) {
      await tx.run(cypher, params);
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await session.close();
  }
}

function recordToObject<T>(record: Neo4jRecord): T {
  const obj: Record<string, unknown> = {};
  for (const key of record.keys) {
    const strKey = String(key);
    const val = record.get(key);
    obj[strKey] = convertNeo4jValue(val);
  }
  return obj as T;
}

function convertNeo4jValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (neo4j.isInt(val)) return val.toNumber();
  if (Array.isArray(val)) return val.map(convertNeo4jValue);
  if (typeof val === 'object' && 'properties' in (val as object)) {
    // Neo4j Node
    const node = val as { properties: Record<string, unknown> };
    return Object.fromEntries(
      Object.entries(node.properties).map(([k, v]) => [k, convertNeo4jValue(v)]),
    );
  }
  return val;
}

export async function saveDbConfig(uri: string, username: string, password?: string): Promise<void> {
  const testDriver = neo4j.driver(
    uri,
    neo4j.auth.basic(username, password ?? ''),
    { connectionAcquisitionTimeout: 5000 }
  );
  try {
    const session = testDriver.session();
    await session.run('RETURN 1');
    await session.close();
  } catch (err) {
    await testDriver.close();
    throw new Error(`Failed to connect to database: ${(err as Error).message}`);
  } finally {
    await testDriver.close();
  }

  const data: DbConfig = { uri, username };
  if (password !== undefined) {
    data.password = password;
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
  activeConfig = data;
  await closeDriver();
}

export async function resetDbConfig(): Promise<void> {
  if (existsSync(CONFIG_PATH)) {
    try {
      unlinkSync(CONFIG_PATH);
    } catch {
      // ignore
    }
  }
  activeConfig = null;
  await closeDriver();
}

export function getDbConfig(): { uri: string; username: string } {
  const config = activeConfig || loadConfig() || {};
  return {
    uri: config.uri ?? process.env['NEO4J_URI'] ?? 'bolt://localhost:7687',
    username: config.username ?? process.env['NEO4J_USERNAME'] ?? 'neo4j',
  };
}

export async function checkConnection(): Promise<boolean> {
  try {
    const driver = getDriver();
    const session = driver.session({ defaultAccessMode: neo4j.session.READ });
    await session.run('RETURN 1');
    await session.close();
    return true;
  } catch {
    return false;
  }
}
