import { sql, usePostgres } from "../src/lib/db";

if (!usePostgres()) {
  console.log(JSON.stringify({ postgres: false, message: "No DATABASE_URL loaded; stripe_events table is unavailable." }, null, 2));
  process.exit(0);
}

const limit = Number(process.argv[2] || 20);
const rows = await sql()`
  select id, type, livemode, status, error, metadata_json, processed_at, created_at, updated_at
  from stripe_events
  where status <> 'processed'
  order by updated_at desc
  limit ${Number.isFinite(limit) ? limit : 20}
`;

console.log(
  JSON.stringify(
    {
      unprocessedCount: rows.length,
      events: rows.map((row) => ({
        id: row.id,
        type: row.type,
        livemode: row.livemode,
        status: row.status,
        error: row.error,
        metadata: row.metadata_json,
        processedAt: row.processed_at,
        updatedAt: row.updated_at
      }))
    },
    null,
    2
  )
);
process.exit(0);
