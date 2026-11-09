'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessao } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { lerPlanilha } from '@/lib/planilha';
import { analisarPlanilha, CAMPOS_EXTRAS, contar, validarLinha, type Bruto, type LinhaAnalisada, type Referencias } from '@/lib/regras/importacao';
import type { Resultado } from '@/lib/cadastros';

/** Campos de uma linha analisada que vão para lote_linhas. */
const colunasLinha = (l: Omit<LinhaAnalisada, 'linha' | 'dados_originais'>) => ({
  placa_normalizada: l.placa_normalizada || null, placa_corrigida: l.placa_corrigida, renavam: l.renavam, modelo: l.modelo,
  patio_id: l.patio_id, servico_id: l.servico_id, observacao: l.observacao, resultado: l.resultado, mensagens: l.mensagens,
  unidade: l.unidade, data_planilha: l.data_planilha, nome_solicitante: l.nome_solicitante, telefone: l.telefone, ano: l.ano, cor: l.cor,
  valor: l.valor, deslocamento: l.deslocamento, pagamento_forma: l.pagamento_forma, pagamento_forma_original: l.pagamento_forma_original,
  pagamento_status: l.pagamento_status, status_os: l.status_os,
});

async function sessao() {
  const s = await getSessao();
  if (!s || s.perfil.bloqueado || s.perfil.deve_trocar_senha) throw new Error('Sessão inválida');
  return s;
}

async function referencias(empresaId: string): Promise<Referencias> {
  const admin = createAdminClient();
  const { data: emp } = await admin.from('empresas_clientes').select('loja_id').eq('id', empresaId).single();
  const loja = emp?.loja_id ?? '00000000-0000-0000-0000-000000000000';
  const [{ data: patios }, { data: apelidos }, { data: servicos }, { data: abertas }] = await Promise.all([
    admin.from('patios').select('id, nome, cidade').eq('ativo', true).eq('loja_id', loja),
    admin.from('patio_apelidos').select('patio_id, apelido').eq('loja_id', loja),
    admin.from('servicos').select('id, nome, padrao').eq('ativo', true).eq('loja_id', loja),
    admin.from('ordens_servico').select('placa, numero').eq('empresa_cliente_id', empresaId).in('status', ['a_vistoriar', 'frustrado']),
  ]);
  return {
    patios: (patios ?? []).map((p) => ({ ...p, apelidos: (apelidos ?? []).filter((a) => a.patio_id === p.id).map((a) => a.apelido) })),
    servicos: servicos ?? [],
    abertas: new Map((abertas ?? []).map((o) => [o.placa, o.numero])),
  };
}

/** Lê o arquivo, analisa cada linha e grava a prévia (lote em status "previa"). */
export async function preverLote(form: FormData): Promise<Resultado<{ loteId: string }>> {
  const s = await sessao();
  const empresaId = s.perfil.perfil === 'loja' ? String(form.get('empresa_id') ?? '') : s.perfil.empresa_cliente_id!;
  const nome = String(form.get('nome_solicitante') ?? '').trim();
  const telefone = String(form.get('telefone') ?? '').replace(/\D/g, '');
  const arquivo = form.get('arquivo');
  const campos: Record<string, string> = {};
  if (!z.string().uuid().safeParse(empresaId).success) campos.empresa_id = 'Escolha o cliente.';
  if (nome.length < 2) campos.nome_solicitante = 'Informe o nome de quem está enviando o lote.';
  if (telefone && telefone.length !== 10 && telefone.length !== 11) campos.telefone = 'Informe um telefone com DDD.';
  if (!(arquivo instanceof File) || !arquivo.size) campos.arquivo = 'Escolha a planilha.';
  else if (!/\.(xlsx|csv)$/i.test(arquivo.name)) campos.arquivo = 'Envie um arquivo .xlsx ou .csv.';
  else if (arquivo.size > 10 * 1024 * 1024) campos.arquivo = 'O arquivo pode ter até 10 MB.';
  if (Object.keys(campos).length) return { ok: false, erro: 'Confira os campos.', campos };
  const arq = arquivo as File;

  let linhas;
  try { linhas = await lerPlanilha(arq); } catch { return { ok: false, erro: 'Não conseguimos ler o arquivo. Salve como .xlsx ou .csv e tente de novo.', campos: { arquivo: 'Arquivo ilegível.' } }; }
  const analise = analisarPlanilha(linhas, await referencias(empresaId));
  if (analise.erroArquivo) return { ok: false, erro: analise.erroArquivo, campos: { arquivo: analise.erroArquivo } };

  const admin = createAdminClient();
  const { data: emp } = await admin.from('empresas_clientes').select('id, ativo, loja_id').eq('id', empresaId).single();
  if (!emp?.ativo) return { ok: false, erro: 'Cliente inativo.' };
  if (s.perfil.perfil === 'loja' && emp.loja_id !== s.perfil.loja_id) return { ok: false, erro: 'Cliente não encontrado.' };
  const c = analise.contadores;
  const { data: lote, error } = await admin.from('lotes_importacao').insert({
    loja_id: emp.loja_id, empresa_cliente_id: empresaId, nome_solicitante: nome, telefone_contato: telefone || null, arquivo_nome: arq.name,
    total: c.total, validas: c.prontas, com_erro: c.comErro, duplicadas: c.duplicadas, criado_por: s.userId,
    // Loja importando: a planilha é o histórico (valem Data, Status, Pagamento e Valor). Cliente: pedidos novos.
    modo: s.perfil.perfil === 'loja' ? 'historico' : 'novo',
  }).select('id').single();
  if (error || !lote) return { ok: false, erro: 'Não foi possível gravar a prévia. Tente de novo.' };
  const caminho = `${empresaId}/${lote.id}/${arq.name.replace(/[^\w.-]+/g, '_')}`;
  await admin.storage.from('importacoes').upload(caminho, arq, { contentType: arq.type || 'application/octet-stream' });
  await admin.from('lotes_importacao').update({ arquivo_path: caminho }).eq('id', lote.id);
  const { error: e2 } = await admin.from('lote_linhas').insert(analise.linhas.map((l) => ({
    lote_id: lote.id, linha: l.linha, dados_originais: l.dados_originais, ...colunasLinha(l),
  })));
  if (e2) return { ok: false, erro: 'Não foi possível gravar a prévia. Tente de novo.' };
  return { ok: true, dados: { loteId: lote.id } };
}

async function loteDoUsuario(loteId: string) {
  const s = await sessao();
  const supabase = await createClient(); // RLS: cliente só enxerga o próprio lote
  const { data: lote } = await supabase.from('lotes_importacao').select('id, empresa_cliente_id, status').eq('id', loteId).maybeSingle();
  return { s, lote };
}

export async function corrigirLinha(loteId: string, linhaId: string, corrigido: { placa: string; modelo: string; renavam: string; patio: string; servico: string; obs: string }): Promise<Resultado> {
  const { lote } = await loteDoUsuario(loteId);
  if (!lote || lote.status !== 'previa') return { ok: false, erro: 'Esta prévia não pode mais ser alterada.' };
  const admin = createAdminClient();
  const { data: outras } = await admin.from('lote_linhas').select('id, linha, placa_normalizada, resultado, dados_originais').eq('lote_id', loteId);
  const ref = await referencias(lote.empresa_cliente_id);
  const anteriores = new Map<string, number>();
  for (const o of outras ?? []) if (o.id !== linhaId && o.placa_normalizada && o.resultado !== 'erro') anteriores.set(o.placa_normalizada, o.linha);
  const original = (outras ?? []).find((o) => o.id === linhaId);
  if (!original) return { ok: false, erro: 'Linha não encontrada.' };
  // Mantém os dados da planilha que a correção não mostra (unidade, data, status, pagamento, valor…)
  const orig = (original.dados_originais ?? {}) as Record<string, string>;
  const bruto: Bruto = { ...corrigido };
  for (const k of CAMPOS_EXTRAS) bruto[k] = orig[k] ?? '';
  const r = validarLinha(bruto, ref, anteriores);
  await admin.from('lote_linhas').update(colunasLinha(r)).eq('id', linhaId);
  await recontar(loteId);
  revalidatePath('/app/importar'); revalidatePath('/loja/importar');
  return r.resultado === 'ok' ? { ok: true } : { ok: false, erro: r.mensagens.join(' ') };
}

export async function excluirLinha(loteId: string, linhaId: string): Promise<Resultado> {
  const { lote } = await loteDoUsuario(loteId);
  if (!lote || lote.status !== 'previa') return { ok: false, erro: 'Esta prévia não pode mais ser alterada.' };
  const admin = createAdminClient();
  await admin.from('lote_linhas').delete().eq('id', linhaId).eq('lote_id', loteId);
  await recontar(loteId);
  revalidatePath('/app/importar'); revalidatePath('/loja/importar');
  return { ok: true };
}

async function recontar(loteId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from('lote_linhas').select('resultado, placa_corrigida').eq('lote_id', loteId);
  const c = contar(data ?? []);
  await admin.from('lotes_importacao').update({ total: c.total, validas: c.prontas, com_erro: c.comErro, duplicadas: c.duplicadas }).eq('id', loteId);
}

export async function confirmarLote(loteId: string): Promise<Resultado<{ criadas: number }>> {
  await sessao();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('confirmar_lote', { p_lote: loteId });
  if (error) {
    const m = error.message;
    const linha = m.match(/LINHA_(\d+):(\w+):(.*)/);
    if (linha) {
      const dup = linha[3].match(/DUPLICADA:(\d+)/);
      return { ok: false, erro: `Nenhuma OS foi criada. Linha ${linha[1]} (${linha[2]}): ${dup ? `já tem a OS nº ${dup[1]} em aberto` : 'dado inválido'}. Corrija ou exclua a linha e tente de novo.` };
    }
    if (m.includes('LOTE_JA_PROCESSADO')) return { ok: false, erro: 'Este lote já foi processado.' };
    if (m.includes('LOTE_SEM_LINHAS_VALIDAS')) return { ok: false, erro: 'Nenhuma linha pronta para criar.' };
    return { ok: false, erro: 'Nenhuma OS foi criada. Tente de novo.' };
  }
  revalidatePath('/app'); revalidatePath('/loja'); revalidatePath('/app/importar'); revalidatePath('/loja/importar');
  return { ok: true, dados: { criadas: data as number } };
}

export async function descartarLote(loteId: string): Promise<Resultado> {
  await sessao();
  const supabase = await createClient();
  const { error } = await supabase.rpc('descartar_lote', { p_lote: loteId });
  if (error) return { ok: false, erro: 'Não foi possível descartar.' };
  revalidatePath('/app/importar'); revalidatePath('/loja/importar');
  return { ok: true };
}
