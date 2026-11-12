'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessao } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MAX_ANEXO, TIPOS_ANEXO_OK } from '@/lib/os';
import { mensagemOperacao } from '@/lib/operacao';
import type { Resultado } from '@/lib/cadastros';

const uuid = z.string().uuid();

async function sessao(perfil?: 'loja') {
  const s = await getSessao();
  if (!s || s.perfil.bloqueado || s.perfil.deve_trocar_senha) throw new Error('Sessão inválida');
  if (perfil && s.perfil.perfil !== perfil) throw new Error('Sem permissão');
  return s;
}

/** Data da conclusão escolhida (só Gestor com conclusão livre). Vazia = agora. */
function dataConclusao(form: FormData, livre: boolean): { iso: string | null; erro?: string } {
  const bruto = String(form.get('concluida_em') ?? '').trim();
  if (!livre || !bruto) return { iso: null };
  const iso = deBrasilia(bruto);
  if (!iso) return { iso: null, erro: 'Informe data e hora válidas.' };
  if (new Date(iso) > new Date(Date.now() + 5 * 60_000)) return { iso: null, erro: 'A conclusão não pode estar no futuro.' };
  // O campo vem preenchido com a hora atual (sem segundos): sem mudança real, vale “agora”
  if (Math.abs(Date.now() - new Date(iso).getTime()) < 2 * 60_000) return { iso: null };
  return { iso };
}

function atualizar(numero: number) {
  revalidatePath('/loja/pendencias'); revalidatePath('/loja');
  revalidatePath(`/loja/os/${numero}`); revalidatePath(`/app/os/${numero}`);
  revalidatePath('/loja'); revalidatePath('/app'); revalidatePath('/loja/pendencias'); revalidatePath('/app/pendencias'); revalidatePath('/loja/agenda');
}

/** Converte "2026-11-05T14:30" (horário de Brasília, vindo do input datetime-local) em ISO. */
function deBrasilia(local: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const d = new Date(`${local}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function agendar(osId: string, numero: number, d: { data_hora: string; local: string; vistoriador_id: string; motivo_id?: string; motivo_texto?: string }): Promise<Resultado> {
  await sessao('loja');
  const quando = deBrasilia(d.data_hora);
  const campos: Record<string, string> = {};
  if (!quando) campos.data_hora = 'Informe data e hora.';
  if (!uuid.safeParse(d.vistoriador_id).success) campos.vistoriador_id = 'Escolha o vistoriador.';
  if (Object.keys(campos).length) return { ok: false, erro: 'Confira os campos.', campos };
  const supabase = await createClient();
  const { error } = await supabase.rpc('agendar_os', {
    p_os: osId, p_data_hora: quando, p_local: d.local, p_vistoriador: d.vistoriador_id,
    p_motivo: d.motivo_id && uuid.safeParse(d.motivo_id).success ? d.motivo_id : null, p_motivo_texto: d.motivo_texto ?? null,
  });
  if (error) return { ok: false, erro: mensagemOperacao(error), campos: error.message.includes('MOTIVO') ? { motivo_id: 'Escolha o motivo do reagendamento.' } : undefined };
  atualizar(numero);
  return { ok: true };
}

export async function mudarEtapa(osId: string, numero: number, etapa: string): Promise<Resultado> {
  await sessao('loja');
  const e = z.enum(['aberta', 'agendada', 'em_execucao', 'laudo_em_elaboracao']).safeParse(etapa);
  if (!e.success) return { ok: false, erro: 'Etapa inválida.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('alterar_etapa', { p_os: osId, p_etapa: e.data });
  if (error) return { ok: false, erro: mensagemOperacao(error) };
  atualizar(numero);
  return { ok: true };
}

async function anexoOpcional(form: FormData, osId: string, empresaId: string, userId: string, nome: string) {
  const arq = form.get('arquivo');
  if (!(arq instanceof File) || !arq.size) return null;
  if (!TIPOS_ANEXO_OK.includes(arq.type)) return 'Anexo: use JPG, PNG ou PDF.';
  if (arq.size > MAX_ANEXO) return 'Anexo: o limite é 20 MB.';
  const supabase = await createClient();
  const limpo = arq.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);
  const caminho = `${empresaId}/${osId}/frustracao-${randomUUID().slice(0, 8)}-${limpo}`;
  const { error } = await supabase.storage.from('anexos').upload(caminho, arq, { contentType: arq.type });
  if (error) return 'Não foi possível enviar o anexo.';
  const admin = createAdminClient();
  await admin.from('anexos').insert({ os_id: osId, tipo: arq.type === 'application/pdf' ? 'documento' : 'foto', bucket: 'anexos', storage_path: caminho, nome_arquivo: arq.name, tamanho_bytes: arq.size, enviado_por: userId });
  return null;
}

export async function frustrar(form: FormData): Promise<Resultado> {
  const s = await sessao('loja');
  const osId = String(form.get('os_id')), numero = Number(form.get('numero'));
  const campos: Record<string, string> = {};
  const motivo = String(form.get('motivo_id') ?? ''), descricao = String(form.get('descricao') ?? '').trim();
  const ocorrida = deBrasilia(String(form.get('ocorrida_em') ?? '')), previsao = String(form.get('previsao') ?? '');
  const responsavel = String(form.get('responsavel') ?? '');
  if (!uuid.safeParse(motivo).success) campos.motivo_id = 'Escolha o motivo.';
  if (!ocorrida) campos.ocorrida_em = 'Informe data e hora.';
  else if (new Date(ocorrida) > new Date(Date.now() + 5 * 60_000)) campos.ocorrida_em = 'Não pode estar no futuro.';
  if (descricao.length < 3) campos.descricao = 'Descreva o que aconteceu.';
  if (!['cliente', 'loja'].includes(responsavel)) campos.responsavel = 'Escolha quem resolve.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(previsao)) campos.previsao = 'Informe a previsão de resolução.';
  if (Object.keys(campos).length) return { ok: false, erro: 'Confira os campos.', campos };
  const supabase = await createClient();
  const { data: os } = await supabase.from('ordens_servico').select('empresa_cliente_id').eq('id', osId).single();
  const { error } = await supabase.rpc('frustrar_os', { p_os: osId, p_motivo: motivo, p_ocorrida_em: ocorrida, p_descricao: descricao, p_responsavel: responsavel, p_previsao: previsao });
  if (error) return { ok: false, erro: mensagemOperacao(error) };
  const e = os ? await anexoOpcional(form, osId, os.empresa_cliente_id, s.userId, s.perfil.nome_exibicao) : null;
  atualizar(numero);
  return e ? { ok: false, erro: `Frustração registrada, mas: ${e}` } : { ok: true };
}

export async function abrirPendencia(osId: string, numero: number, d: { tipo: string; descricao: string; responsavel: string; previsao: string }): Promise<Resultado> {
  await sessao('loja');
  const campos: Record<string, string> = {};
  if (!['documental', 'falta_autorizacao', 'nao_localizado', 'agendamento', 'outra'].includes(d.tipo)) campos.tipo = 'Escolha o tipo.';
  if (d.descricao.trim().length < 3) campos.descricao = 'Descreva a pendência.';
  if (!['cliente', 'loja'].includes(d.responsavel)) campos.responsavel = 'Escolha quem resolve.';
  if (d.previsao && !/^\d{4}-\d{2}-\d{2}$/.test(d.previsao)) campos.previsao = 'Data inválida.';
  if (Object.keys(campos).length) return { ok: false, erro: 'Confira os campos.', campos };
  const supabase = await createClient();
  const { error } = await supabase.rpc('abrir_pendencia', { p_os: osId, p_tipo: d.tipo, p_descricao: d.descricao, p_responsavel: d.responsavel, p_previsao: d.previsao || null });
  if (error) return { ok: false, erro: mensagemOperacao(error) };
  atualizar(numero);
  return { ok: true };
}

export async function resolverPendencia(pendenciaId: string, numero: number, texto: string): Promise<Resultado> {
  await sessao('loja');
  if (texto.trim().length < 3) return { ok: false, erro: 'Descreva como foi resolvida.', campos: { texto: 'Descreva como foi resolvida.' } };
  const supabase = await createClient();
  const { error } = await supabase.rpc('resolver_pendencia', { p_pendencia: pendenciaId, p_texto: texto });
  if (error) return { ok: false, erro: mensagemOperacao(error) };
  atualizar(numero);
  return { ok: true };
}

export async function responderPendencia(pendenciaId: string, numero: number, texto: string): Promise<Resultado> {
  await sessao();
  if (texto.trim().length < 2) return { ok: false, erro: 'Escreva a resposta.', campos: { texto: 'Escreva a resposta.' } };
  const supabase = await createClient();
  const { error } = await supabase.rpc('responder_pendencia', { p_pendencia: pendenciaId, p_texto: texto });
  if (error) return { ok: false, erro: mensagemOperacao(error) };
  atualizar(numero);
  return { ok: true };
}

export async function cancelar(osId: string, numero: number, d: { nome: string; motivo_id: string; descricao: string }): Promise<Resultado> {
  await sessao();
  const campos: Record<string, string> = {};
  if (d.nome.trim().length < 2) campos.nome = 'Informe o nome de quem pediu.';
  if (!uuid.safeParse(d.motivo_id).success) campos.motivo_id = 'Escolha o motivo.';
  if (d.descricao.trim().length < 3) campos.descricao = 'Explique o cancelamento.';
  if (Object.keys(campos).length) return { ok: false, erro: 'Confira os campos.', campos };
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancelar_os', { p_os: osId, p_nome: d.nome, p_motivo: d.motivo_id, p_descricao: d.descricao });
  if (error) return { ok: false, erro: mensagemOperacao(error) };
  atualizar(numero);
  return { ok: true };
}

export async function enviarLaudo(form: FormData): Promise<Resultado<{ versao: number }>> {
  const s = await sessao('loja');
  const quando = dataConclusao(form, !!s.perfil.conclusao_livre);
  if (quando.erro) return { ok: false, erro: 'Confira os campos.', campos: { concluida_em: quando.erro } };
  const osId = String(form.get('os_id')), numero = Number(form.get('numero'));
  const arq = form.get('arquivo');
  if (!(arq instanceof File) || !arq.size) return { ok: false, erro: 'Escolha o PDF do laudo.' };
  if (arq.type !== 'application/pdf' && !arq.name.toLowerCase().endsWith('.pdf')) return { ok: false, erro: 'O laudo precisa ser PDF.' };
  if (arq.size > MAX_ANEXO) return { ok: false, erro: 'O laudo pode ter até 20 MB.' };
  const supabase = await createClient();
  const { data: os } = await supabase.from('ordens_servico').select('id, empresa_cliente_id').eq('id', osId).single();
  if (!os) return { ok: false, erro: 'OS não encontrada.' };
  const { count } = await supabase.from('anexos').select('id', { count: 'exact', head: true }).eq('os_id', osId).eq('tipo', 'laudo');
  const versao = (count ?? 0) + 1;
  const caminho = `${os.empresa_cliente_id}/${osId}/v${versao}.pdf`;
  const { error: up } = await supabase.storage.from('laudos').upload(caminho, arq, { contentType: 'application/pdf', upsert: false });
  if (up) return { ok: false, erro: up.message.includes('exists') ? 'Outra pessoa enviou um laudo agora mesmo. Atualize a página.' : 'Não foi possível enviar o arquivo. Tente de novo.' };
  const { error } = await supabase.rpc('registrar_laudo', { p_os: osId, p_versao: versao, p_path: caminho, p_nome: arq.name, p_tamanho: arq.size, p_concluida_em: quando.iso });
  if (error) {
    await supabase.storage.from('laudos').remove([caminho]);
    return { ok: false, erro: mensagemOperacao(error) };
  }
  await vistoriadorDaConclusao(form, osId);
  atualizar(numero);
  return { ok: true, dados: { versao } };
}

/** Conclui a OS sem laudo (alerta na tela, motivo e confirmação obrigatórios). O laudo pode ser anexado depois. */
export async function concluirSemLaudo(form: FormData): Promise<Resultado> {
  const s = await sessao('loja');
  const livre = !!s.perfil.conclusao_livre;
  const osId = String(form.get('os_id') ?? ''), numero = Number(form.get('numero'));
  const motivo = String(form.get('motivo') ?? '').trim();
  const campos: Record<string, string> = {};
  if (!uuid.safeParse(osId).success) return { ok: false, erro: 'OS não encontrada.' };
  if (!livre && motivo.length < 5) campos.motivo = 'Explique por que a OS está sendo concluída sem laudo (ex.: laudo entregue em papel ao cliente).';
  if (!livre && form.get('ciente') !== 'on') campos.ciente = 'Marque a confirmação para concluir sem laudo.';
  const quando = dataConclusao(form, livre);
  if (quando.erro) campos.concluida_em = quando.erro;
  if (Object.keys(campos).length) return { ok: false, erro: 'Confira os campos.', campos };
  const supabase = await createClient();
  const { error } = await supabase.rpc('concluir_sem_laudo', { p_os: osId, p_motivo: motivo, p_concluida_em: quando.iso });
  if (error) return { ok: false, erro: mensagemOperacao(error) };
  const eV = await vistoriadorDaConclusao(form, osId);
  atualizar(numero);
  if (eV) return { ok: true, erro: `OS concluída, mas o vistoriador não foi salvo: ${eV}` } as Resultado;
  return { ok: true };
}

/** Reabre uma OS vistoriada ou cancelada (só Gestor com conclusão livre). */
export async function reabrirOs(osId: string, numero: number, motivo: string): Promise<Resultado> {
  const s = await sessao('loja');
  if (!s.perfil.conclusao_livre) return { ok: false, erro: 'Você não tem permissão para reabrir OS.' };
  if (!uuid.safeParse(osId).success) return { ok: false, erro: 'OS não encontrada.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('reabrir_os', { p_os: osId, p_motivo: motivo.trim().slice(0, 500) });
  if (error) return { ok: false, erro: mensagemOperacao(error) };
  atualizar(numero);
  return { ok: true };
}

/** Pausa (ou retoma) o prazo da OS à mão (só Gestor com conclusão livre). */
export async function pausarOs(osId: string, numero: number, motivo: string): Promise<Resultado> {
  const s = await sessao('loja');
  if (!s.perfil.conclusao_livre) return { ok: false, erro: 'Você não tem permissão para pausar OS.' };
  if (!uuid.safeParse(osId).success) return { ok: false, erro: 'OS não encontrada.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('pausar_os', { p_os: osId, p_motivo: motivo.trim().slice(0, 500) });
  if (error) return { ok: false, erro: mensagemOperacao(error) };
  atualizar(numero);
  return { ok: true };
}

export async function retomarOs(osId: string, numero: number): Promise<Resultado> {
  const s = await sessao('loja');
  if (!s.perfil.conclusao_livre) return { ok: false, erro: 'Você não tem permissão para retomar OS.' };
  if (!uuid.safeParse(osId).success) return { ok: false, erro: 'OS não encontrada.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('retomar_os', { p_os: osId });
  if (error) return { ok: false, erro: mensagemOperacao(error) };
  atualizar(numero);
  return { ok: true };
}

/** Informa/corrige a data de abertura (só Gestor com conclusão livre). O prazo é recalculado por ela. */
export async function alterarAbertura(osId: string, numero: number, local: string): Promise<Resultado> {
  const s = await sessao('loja');
  if (!s.perfil.conclusao_livre) return { ok: false, erro: 'Você não tem permissão para alterar a abertura.' };
  if (!uuid.safeParse(osId).success) return { ok: false, erro: 'OS não encontrada.' };
  const iso = deBrasilia(local);
  if (!iso) return { ok: false, erro: 'Confira os campos.', campos: { aberta_em: 'Informe data e hora válidas.' } };
  if (new Date(iso) > new Date(Date.now() + 5 * 60_000)) return { ok: false, erro: 'Confira os campos.', campos: { aberta_em: 'A abertura não pode estar no futuro.' } };
  const supabase = await createClient();
  const { error } = await supabase.rpc('alterar_abertura', { p_os: osId, p_aberta_em: iso });
  if (error) return { ok: false, erro: mensagemOperacao(error), campos: { aberta_em: mensagemOperacao(error) } };
  atualizar(numero);
  return { ok: true };
}

export type ResultadoLote = { agendadas: number; falhas: { numero: number | null; erro: string }[] };

/** Agenda várias OS de uma vez para um vistoriador (Fila de OS). Cada uma aparece na Agenda. */
export async function agendarLote(ids: string[], d: { data: string; hora: string; intervalo: string; vistoriador_id: string; local: string; motivo_id: string }): Promise<Resultado<ResultadoLote>> {
  await sessao('loja');
  const campos: Record<string, string> = {};
  const lista = [...new Set(ids)].filter((id) => uuid.safeParse(id).success);
  if (!lista.length) return { ok: false, erro: 'Selecione pelo menos uma OS.' };
  if (lista.length > 500) return { ok: false, erro: 'Selecione no máximo 500 OS por vez.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data)) campos.data = 'Informe o dia.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.hora)) campos.hora = 'Informe a hora (ex.: 08:00).';
  if (!uuid.safeParse(d.vistoriador_id).success) campos.vistoriador_id = 'Escolha o vistoriador.';
  const intervalo = Math.max(0, Math.min(240, Number(d.intervalo) || 0));
  if (Object.keys(campos).length) return { ok: false, erro: 'Confira os campos.', campos };
  const inicio = deBrasilia(`${d.data}T${d.hora}`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('agendar_lote', {
    p_os: lista, p_inicio: inicio, p_intervalo_min: intervalo, p_vistoriador: d.vistoriador_id,
    p_local: d.local.trim() || null, p_motivo: uuid.safeParse(d.motivo_id).success ? d.motivo_id : null,
  });
  if (error) return { ok: false, erro: mensagemOperacao(error) };
  const linhas = (data ?? []) as { os_id: string; numero: number | null; ok: boolean; erro: string | null }[];
  const falhas = linhas.filter((l) => !l.ok).map((l) => ({
    numero: l.numero,
    erro: (l.erro ?? '').includes('MOTIVO_OBRIGATORIO') ? 'já estava agendada: escolha o motivo do reagendamento' : mensagemOperacao({ message: l.erro ?? '' }),
  }));
  revalidatePath('/loja'); revalidatePath('/loja/agenda'); revalidatePath('/loja/pendencias');
  return { ok: true, dados: { agendadas: linhas.filter((l) => l.ok).length, falhas } };
}

/** Define/corrige o vistoriador que fez (ou vai fazer) a vistoria. Vazio = sem vistoriador. */
export async function definirVistoriador(osId: string, numero: number, vistoriadorId: string): Promise<Resultado> {
  await sessao('loja');
  if (!uuid.safeParse(osId).success) return { ok: false, erro: 'OS não encontrada.' };
  const vist = vistoriadorId && uuid.safeParse(vistoriadorId).success ? vistoriadorId : null;
  const supabase = await createClient();
  const { error } = await supabase.rpc('definir_vistoriador', { p_os: osId, p_vistoriador: vist });
  if (error) return { ok: false, erro: mensagemOperacao(error) };
  atualizar(numero);
  return { ok: true };
}

/** Na conclusão: grava o vistoriador escolhido (se o campo veio no formulário). */
async function vistoriadorDaConclusao(form: FormData, osId: string): Promise<string | null> {
  if (!form.has('vistoriador_id')) return null;
  const v = String(form.get('vistoriador_id') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.rpc('definir_vistoriador', { p_os: osId, p_vistoriador: v && uuid.safeParse(v).success ? v : null });
  return error ? mensagemOperacao(error) : null;
}
