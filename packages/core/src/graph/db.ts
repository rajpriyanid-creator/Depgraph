import neo4j, { type Driver, type Record as Neo4jRecord } from 'neo4j-driver';

const DEFAULT_URI = process.env['NEO4J_URI'] ?? 'bolt://localhost:7687';
const DEFAULT_USER = process.env['NEO4J_USERNAME'] ?? 'neo4j';
const DEFAULT_PASS = process.env['NEO4J_PASSWORD'] ?? 'depgraph';

let driverInstance: Driver | null = null;

/**
 * Returns the singleton Neo4j driver instance.
 * Creates it on first call using environment variables.
 */
export function getDriver(uri?: string, username?: string, password?: string): Driver {
  if (!driverInstance) {
    driverInstance = neo4j.driver(
      uri ?? DEFAULT_URI,
      neo4j.auth.basic(username ?? DEFAULT_USER, password ?? DEFAULT_PASS),
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
