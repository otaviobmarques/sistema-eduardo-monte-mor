import type { Metadata } from 'next';
import Link from 'next/link';
import { Cabecalho } from '@/components/ui';
import { CAMPOS_TECNICOS, ROTULO_CAMPO, ROTULO_TABELA, valorLegivel } from '@/lib/auditoria';
import { dataHora, ETAPA_LABEL, PAGAMENTO_LABEL, STATUS_LABEL } from '@/lib/formato';
import { normalizarPlaca, placaValida } from '@/lib/regras/placa';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Auditoria' };

const legivel = (campo: string, v: string | null) => {
  if (v && campo === 'status') return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v;
  if (v && campo === 'etapa') return ETAPA_LABEL[v as keyof typeof ETAPA_LABEL] ?? v;
  if (v && campo === 'pagamento_status') return PAGAMENTO_LABEL[v as keyof typeof PAGAMENTO_LABEL] ?? v;
  return valorLegivel(campo, v);
};

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ q?: string; tabela?: string; de?: string; ate?: string; usuario?: string }> }) {
  const f = await searchParams;
  const supabase = await createClient();
  const { data: pessoas } = await supabase.from('perfis_usuario').select('user_id, nome_exibicao, login, perfil').order('nome_exibicao');
  const nome = new Map((pessoas ?? []).map((p) => [p.user_id, p.nome_exibicao]));

  let q = supabase.from('auditoria').select('id, tabela, registro_id, campo, valor_anterior, valor_novo, usuario_id, em').order('em', { ascending: false }).limit(300);
  if (f.tabela && f.tabela in ROTULO_TABELA) q = q.eq('tabela', f.tabela);
  if (f.usuario && /^[0-9a-f-]{36}$/.test(f.usuario)) q = q.eq('usuario_id', f.usuario);
  if (f.de && /^\d{4}-\d{2}-\d{2}$/.test(f.de)) q = q.gte('em', `${f.de}T00:00:00-03:00`);
  if (f.ate && /^\d{4}-\d{2}-\d{2}$/.test(f.ate)) q = q.lte('em', `${f.ate}T23:59:59-03:00`);
  const termo = (f.q ?? '').trim();
  let filtroOs: string[] | null = null;
  if (termo) {
    // Placa ou nº da OS → registros daquela OS
    const p = normalizarPlaca(termo);
    const { data: oss } = await supabase.from('ordens_servico').select('id').or(
      [placaValida(p) ? `placa.eq.${p}` : null, /^\d{1,12}$/.test(termo) ? `numero.eq.${termo}` : null].filter(Boolean).join(',') || 'id.is.null');
    filtroOs = (oss ?? []).map((o) => o.id);
    if (filtroOs.length) q = q.in('registro_id', filtroOs);
    else q = q.or(`valor_novo.ilike.%${termo.replace(/[%,()]/g, ' ')}%,valor_anterior.ilike.%${termo.replace(/[%,()]/g, ' ')}%`);
  }
  const { data } = await q;
  const linhas = (data ?? []).filter((a) => !CAMPOS_TECNICOS.has(a.campo));
  const idsOs = [...new Set(linhas.filter((a) => a.tabela === 'ordens_servico').map((a) => a.registro_id))] as string[];
  const { data: numeros } = idsOs.length ? await supabase.from('ordens_servico').select('id, numero, placa').in('id', idsOs) : { data: [] };
  const osMap = new Map((numeros ?? []).map((o) => [o.id, o]));

  return (
    <>
      <Cabecalho kicker="Sistema" titulo="Auditoria" descricao="Cada alteração com valor anterior, novo, usuário e data. Mostra os 300 registros mais recentes do filtro." />
      <form className="card mb-6 grid gap-4 p-4 md:grid-cols-[1fr_200px_200px_160px_160px_auto] md:items-end" role="search">
        <div>
          <label className="rotulo" htmlFor="aud-q">Placa, nº da OS ou valor</label>
          <input id="aud-q" name="q" className="campo" defaultValue={f.q} placeholder="Ex.: EUI6776" />
        </div>
        <div>
          <label className="rotulo" htmlFor="aud-tabela">Registro</label>
          <select id="aud-tabela" name="tabela" className="campo" defaultValue={f.tabela ?? ''}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_TABELA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="aud-usuario">Usuário</label>
          <select id="aud-usuario" name="usuario" className="campo" defaultValue={f.usuario ?? ''}>
            <option value="">Todos</option>
            {(pessoas ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.nome_exibicao} ({p.login})</option>)}
          </select>
        </div>
        <div><label className="rotulo" htmlFor="aud-de">De</label><input id="aud-de" name="de" type="date" className="campo" defaultValue={f.de} /></div>
        <div><label className="rotulo" htmlFor="aud-ate">Até</label><input id="aud-ate" name="ate" type="date" className="campo" defaultValue={f.ate} /></div>
        <button className="btn btn-primario">Buscar</button>
      </form>
      {linhas.length === 0 ? <div className="card p-10 text-center text-text-secondary">Nenhum registro encontrado.</div> : (
        <div className="overflow-x-auto">
          <table className="tabela tabela-cartoes">
            <thead><tr><th scope="col">Quando</th><th scope="col">Registro</th><th scope="col">Campo</th><th scope="col">Antes</th><th scope="col">Depois</th><th scope="col">Quem</th></tr></thead>
            <tbody>
              {linhas.map((a) => {
                const os = a.registro_id ? osMap.get(a.registro_id) : undefined;
                return (
                  <tr key={a.id}>
                    <td data-rotulo="Quando" className="whitespace-nowrap">{dataHora(a.em)}</td>
                    <td data-rotulo="Registro">
                      {ROTULO_TABELA[a.tabela] ?? a.tabela}
                      {os && <Link className="ml-1 font-semibold text-action hover:underline" href={`/loja/os/${os.numero}`}>{os.numero} · {os.placa}</Link>}
                    </td>
                    <td data-rotulo="Campo" className="font-semibold">{ROTULO_CAMPO[a.campo] ?? a.campo}</td>
                    <td data-rotulo="Antes" className="text-text-secondary">{legivel(a.campo, a.valor_anterior)}</td>
                    <td data-rotulo="Depois">{legivel(a.campo, a.valor_novo)}</td>
                    <td data-rotulo="Quem">{a.usuario_id ? nome.get(a.usuario_id) ?? 'Usuário' : 'Sistema'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
