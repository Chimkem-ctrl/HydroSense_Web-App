import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: fileURLToPath(new URL('../.env.local', import.meta.url)) });

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error('Set SUPABASE_DB_URL to the database to inspect.');

const args = process.argv.slice(2);
const id = args[0] === '--delete' && args.length === 2 ? args[1] : undefined;
if (args.length && (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
  throw new Error('Usage: node scripts/cleanup-orphaned-auth.mjs [--delete USER_UUID]');
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  if (!id) {
    const result = await client.query(`
      select u.id, u.email, u.created_at,
        exists(select 1 from public.audit_logs a where a.action = 'User deleted'
          and a.detail like u.id::text || ': profile deleted; auth deletion failed%') as partial_delete_audited
      from auth.users u
      where not exists (select 1 from public.profiles p where p.id = u.id)
      order by u.created_at
    `);
    console.table(result.rows);
    console.log('Review every account before deleting it; a missing profile does not prove it was intentionally deleted.');
  } else {
    await client.query('begin');
    try {
      await client.query('select id from auth.users where id = $1 for update', [id]);
      const result = await client.query(`
        delete from auth.users u
        where u.id = $1 and not exists (select 1 from public.profiles p where p.id = u.id)
        returning u.id
      `, [id]);
      if (result.rowCount !== 1) throw new Error('No orphaned auth user with that ID was found; nothing was deleted.');
      await client.query(`
        insert into public.audit_logs (user_name, action, detail)
        values ('orphan cleanup', 'User deleted', $1)
      `, [id]);
      await client.query('commit');
      console.log(`Deleted orphaned auth user ${id}.`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }
} finally {
  await client.end();
}
