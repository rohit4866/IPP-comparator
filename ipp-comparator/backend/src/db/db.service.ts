import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, types } from 'pg';

types.setTypeParser(1700, (v) => parseFloat(v)); // numeric -> number
types.setTypeParser(20, (v) => parseInt(v, 10)); // bigint -> number
types.setTypeParser(1082, (v) => v); // date -> 'YYYY-MM-DD'

export type Q = Pick<PoolClient, 'query'>;

@Injectable()
export class DbService implements OnModuleDestroy {
  pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgres://ipp:ipp@localhost:5432/ipp_comparator',
  });

  query<T = any>(sql: string, params: any[] = []) {
    return this.pool.query(sql, params).then((r) => r.rows as T[]);
  }

  async one<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return (await this.query<T>(sql, params))[0];
  }

  async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }

  onModuleDestroy() {
    return this.pool.end();
  }
}
