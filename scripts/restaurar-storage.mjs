// Envia de volta os arquivos de um backup (pasta criada por backup-storage.mjs) para os buckets do projeto.
// Uso: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/restaurar-storage.mjs <pasta-do-backup>
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const origem = process.argv[2];
if (!url || !chave || !origem) { console.error('Uso: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/restaurar-storage.mjs <pasta>'); process.exit(1); }
const sb = createClient(url, chave, { auth: { persistSession: false } });
const { buckets } = JSON.parse(await readFile(path.join(origem, 'manifesto.json'), 'utf8'));
const TIPO = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.csv': 'text/csv', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

for (const [bucket, arquivos] of Object.entries(buckets)) {
  const { error: eb } = await sb.storage.createBucket(bucket, { public: false });
  if (eb && !/exists/i.test(eb.message)) throw new Error(`${bucket}: ${eb.message}`);
  let n = 0;
  for (const a of arquivos) {
    const buf = await readFile(path.join(origem, bucket, a));
    const { error } = await sb.storage.from(bucket).upload(a, buf, { upsert: true, contentType: TIPO[path.extname(a).toLowerCase()] ?? 'application/octet-stream' });
    if (error) throw new Error(`${bucket}/${a}: ${error.message}`);
    n++;
  }
  console.log(`${bucket}: ${n} arquivo(s) restaurado(s)`);
}
