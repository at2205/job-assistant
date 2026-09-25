import { Pool, PoolClient, QueryResult } from 'pg';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL not set in .env');
    }

    pool = new Pool({
      connectionString,
      max: parseInt(process.env.DB_POOL_SIZE || '5'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      logger.error(`Unexpected PostgreSQL pool error: ${err.message}`);
    });

    logger.info('PostgreSQL connection pool created');
  }

  return pool;
}

export async function query<T extends Record<string, any> = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await getPool().query<T>(text, params);
  const duration = Date.now() - start;

  if (duration > 1000) {
    logger.warn(`Slow query (${duration}ms): ${text.substring(0, 100)}...`);
  }

  return result;
}

export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run all SQL migration files in order.
 */
export async function runMigrations(): Promise<void> {
  const migrationsDir = path.resolve(__dirname, 'migrations');

  // Create migrations tracking table
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const executed = await query('SELECT 1 FROM _migrations WHERE filename = $1', [file]);
    if (executed.rowCount && executed.rowCount > 0) {
      logger.debug(`Migration already executed: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    logger.info(`Running migration: ${file}`);

    try {
      await query(sql);
      await query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      logger.info(`Migration completed: ${file}`);
    } catch (err: any) {
      logger.error(`Migration failed: ${file} — ${err.message}`);
      throw err;
    }
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('PostgreSQL pool closed');
  }
}
