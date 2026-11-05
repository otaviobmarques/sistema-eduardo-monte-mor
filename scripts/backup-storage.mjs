// Copia todos os arquivos dos buckets privados (laudos, anexos, importações) para uma pasta local.
// Uso: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/backup-storage.mjs <pasta-destino>
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
const destino = process.argv[2];
if (!url || !chave || !destino) { console.error('Uso: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/backup-storage.mjs <pasta>'); process.exit(1); }
const sb = createClient(url, chave, { auth: { persistSession: false } });
const BUCKETS = ['laudos', 'anexos', 'importacoes'];

async function listar(bucket, prefixo = '') {
  const arquivos = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(bucket).list(prefixo, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefixo}: ${error.message}`);
    for (const item of data ?? []) {
      const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
      if (item.id === null) arquivos.push(...(await listar(bucket, caminho))); // pasta
      else arquivos.push(caminho);
    }
    if (!data || data.length < 1000) break;
  }
  return arquivos;
}

await mkdir(destino, { recursive: true });
let total = 0, bytes = 0;
const manifesto = {};
for (const bucket of BUCKETS) {
  const arquivos = await listar(bucket);
  manifesto[bucket] = arquivos;
  for (const a of arquivos) {
    const { data, error } = await sb.storage.from(bucket).download(a);
    if (error) throw new Error(`${bucket}/${a}: ${error.message}`);
    const buf = Buffer.from(await data.arrayBuffer());
    const alvo = path.join(destino, bucket, a);
    await mkdir(path.dirname(alvo), { recursive: true });
    await writeFile(alvo, buf);
    total++; bytes += buf.length;
  }
  console.log(`${bucket}: ${arquivos.length} arquivo(s)`);
}
await writeFile(path.join(destino, 'manifesto.json'), JSON.stringify({ gerado_em: new Date().toISOString(), buckets: manifesto }, null, 2));
console.log(`Total: ${total} arquivo(s), ${(bytes / 1048576).toFixed(1)} MB`);
