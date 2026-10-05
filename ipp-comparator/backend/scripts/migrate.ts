import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL || 'postgres://ipp:ipp@localhost:5432/ipp_comparator' });
  await c.connect();
  await c.query(readFileSync(join(__dirname, '../../db/schema.sql'), 'utf8'));
  await c.end();
  console.log('Schema applied');
})().catch((e) => { console.error(e); process.exit(1); });
