'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessao } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MAX_ANEXO, TIPOS_ANEXO_OK, mensagemErroAbertura, novaOsSchema } from '@/lib/os';
import { normalizarPlaca, placaValida } from '@/lib/regras/placa';
import type { Resultado } from '@/lib/cadastros';

async function sessaoValida() {
  const s = await getSessao();
  if (!s || s.perfil.bloqueado || s.perfil.deve_trocar_senha) throw new Error('Sessão inválida');
  return s;
}

export interface InfoPlaca {
  ultima: { numero: number; marca_modelo: string | null; ano: string | null; cor: string | null; categoria_id: string | null; renavam: string | null } | null;
  aberta: number | null;
}

/** Placa já conhecida (última OS do mesmo cliente) e OS em aberto para a mesma placa. */
export async function consultarPlaca(placa: string, empresaId: string | null): Promise<InfoPlaca> {
  const s = await sessaoValida();
  const p = normalizarPlaca(placa);
  if (!placaValida(p)) return { ultima: null, aberta: null };
  const empresa = s.perfil.perfil === 'loja' ? empresaId : s.perfil.empresa_cliente_id;
  if (!empresa) return { ultima: null, aberta: null };
  const supabase = await createClient();
  const { data } = await supabase.from('ordens_servico')
    .select('numero, status, marca_modelo, ano, cor, categoria_id, renavam')
    .eq('empresa_cliente_id', empresa).eq('placa', p).order('numero', { ascending: false }).limit(10);
  const aberta = data?.find((o) => o.status === 'a_vistoriar' || o.status === 'frustrado')?.numero ?? null;
  const u = data?.[0];
  return { ultima: u ? { numero: u.numero, marca_modelo: u.marca_modelo, ano: u.ano, cor: u.cor, categoria_id: u.categoria_id, renavam: u.renavam } : null, aberta };
}

async function enviarAnexo(osId: string, empresaId: string, tipo: 'foto' | 'documento' | 'comprovante' | 'justificativa', arquivo: File, userId: string, nome: string) {
  if (!TIPOS_ANEXO_OK.includes(arquivo.type)) return `“${arquivo.name}”: use JPG, PNG ou PDF.`;
  if (arquivo.size > MAX_ANEXO) return `“${arquivo.name}”: o limite é 20 MB.`;
  const supabase = await createClient();
  const limpo = arquivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);
  const caminho = `${empresaId}/${osId}/${tipo}-${randomUUID().slice(0, 8)}-${limpo}`;
  const { error } = await supabase.storage.from('anexos').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
  if (error) return `“${arquivo.name}”: não foi possível enviar.`;
  const admin = createAdminClient();
  await admin.from('anexos').insert({ os_id: osId, tipo, bucket: 'anexos', storage_path: caminho, nome_arquivo: arquivo.name, tamanho_bytes: arquivo.size, enviado_por: userId });
  await admin.from('historico_os').insert({ os_id: osId, evento: 'Anexo enviado', para: arquivo.name, usuario_id: userId, nome_exibicao: nome });
  return null;
}

export async function abrirOs(form: FormData): Promise<Resultado<{ numero: number }>> {
  const s = await sessaoValida();
  let bruto: unknown;
  try { bruto = JSON.parse(String(form.get('dados') ?? '{}')); } catch { return { ok: false, erro: 'Dados inválidos.' }; }
  const parsed = novaOsSchema.safeParse(bruto);
  if (!parsed.success) {
    const campos: Record<string, string> = {};
    for (const i of parsed.error.issues) campos[String(i.path[0])] ??= i.message;
    return { ok: false, erro: 'Confira os campos destacados.', campos };
  }
  const d = parsed.data;
  if (s.perfil.perfil === 'loja' && !d.empresa_id) return { ok: false, erro: 'Escolha o cliente.', campos: { empresa_id: 'Escolha o cliente.' } };
  const arquivos = form.getAll('anexos').filter((f): f is File => f instanceof File && f.size > 0);
  for (const f of arquivos) {
    if (!TIPOS_ANEXO_OK.includes(f.type)) return { ok: false, erro: `“${f.name}”: use JPG, PNG ou PDF.` };
    if (f.size > MAX_ANEXO) return { ok: false, erro: `“${f.name}”: o limite é 20 MB.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('abrir_os', {
    p_empresa: s.perfil.perfil === 'loja' ? d.empresa_id : null,
    p_nome_solicitante: d.nome_solicitante, p_telefone: d.telefone || null, p_placa: d.placa, p_renavam: d.renavam || null,
    p_marca_modelo: d.marca_modelo, p_ano: d.ano || null, p_cor: d.cor || null, p_categoria_id: d.categoria_id, p_servico_id: d.servico_id,
    p_local_tipo: d.local_tipo, p_patio_id: d.local_tipo === 'patio' ? d.patio_id : null,
    p_endereco: d.local_tipo === 'endereco' ? d.endereco : null, p_cidade: d.local_tipo === 'endereco' ? d.cidade : null,
    p_uf: d.local_tipo === 'endereco' ? d.uf : null, p_observacao: d.observacao || null,
  });
  if (error || !data?.[0]) {
    const m = mensagemErroAbertura(error?.message);
    return { ok: false, erro: m.texto, campos: m.campo ? { [m.campo]: m.texto } : undefined };
  }
  const { id, numero } = data[0] as { id: string; numero: number };
  const empresaId = s.perfil.perfil === 'loja' ? d.empresa_id! : s.perfil.empresa_cliente_id!;
  const falhas: string[] = [];
  for (const f of arquivos) {
    const e = await enviarAnexo(id, empresaId, f.type === 'application/pdf' ? 'documento' : 'foto', f, s.userId, s.perfil.nome_exibicao);
    if (e) falhas.push(e);
  }
  revalidatePath('/loja'); revalidatePath('/app');
  return { ok: true, dados: { numero }, ...(falhas.length ? { erro: falhas.join(' ') } : {}) } as Resultado<{ numero: number }>;
}

/** Anexo avulso na ficha (Loja). */
export async function anexarNaOs(form: FormData): Promise<Resultado> {
  const s = await sessaoValida();
  if (s.perfil.perfil !== 'loja') return { ok: false, erro: 'Sem permissão.' };
  const osId = String(form.get('os_id') ?? '');
  const tipo = z.enum(['foto', 'documento', 'comprovante', 'justificativa']).safeParse(form.get('tipo'));
  const arq = form.get('arquivo');
  if (!tipo.success || !(arq instanceof File) || !arq.size) return { ok: false, erro: 'Escolha o arquivo e o tipo.' };
  const supabase = await createClient();
  const { data: os } = await supabase.from('ordens_servico').select('id, numero, empresa_cliente_id').eq('id', osId).single();
  if (!os) return { ok: false, erro: 'OS não encontrada.' };
  const e = await enviarAnexo(os.id, os.empresa_cliente_id, tipo.data, arq, s.userId, s.perfil.nome_exibicao);
  if (e) return { ok: false, erro: e };
  revalidatePath(`/loja/os/${os.numero}`);
  return { ok: true };
}

/** URL assinada de curta duração (60 s). A visibilidade passa pela RLS do usuário. */
export async function urlAnexo(anexoId: string): Promise<Resultado<{ url: string }>> {
  await sessaoValida();
  const supabase = await createClient();
  const { data: a } = await supabase.from('anexos').select('bucket, storage_path, nome_arquivo').eq('id', anexoId).single();
  if (!a) return { ok: false, erro: 'Arquivo não encontrado.' };
  const { data, error } = await supabase.storage.from(a.bucket).createSignedUrl(a.storage_path, 60, { download: a.nome_arquivo });
  if (error || !data) return { ok: false, erro: 'Não foi possível gerar o link. Tente de novo.' };
  return { ok: true, dados: { url: data.signedUrl } };
}

const veiculoSchema = z.object({
  marca_modelo: z.string().trim().min(2, 'Informe a marca e o modelo.'),
  ano: z.string().trim().optional().refine((v) => !v || /^\d{4}(\/\d{4})?$/.test(v), 'Use o formato 2020 ou 2020/2021.'),
  cor: z.string().trim().optional(),
  categoria_id: z.string().uuid('Escolha a categoria.'),
  renavam: z.string().optional(),
});

export async function atualizarVeiculo(osId: string, numero: number, dados: z.input<typeof veiculoSchema>): Promise<Resultado> {
  const s = await sessaoValida();
  if (s.perfil.perfil !== 'loja') return { ok: false, erro: 'Sem permissão.' };
  const p = veiculoSchema.safeParse(dados);
  if (!p.success) {
    const campos: Record<string, string> = {};
    for (const i of p.error.issues) campos[String(i.path[0])] ??= i.message;
    return { ok: false, erro: 'Confira os campos.', campos };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('atualizar_veiculo_os', {
    p_os: osId, p_marca_modelo: p.data.marca_modelo, p_ano: p.data.ano ?? null, p_cor: p.data.cor ?? null,
    p_categoria_id: p.data.categoria_id, p_renavam: p.data.renavam ?? null,
  });
  if (error) return { ok: false, erro: error.message.includes('RENAVAM') ? 'Renavam inválido. Confira os 11 dígitos.' : 'Não foi possível salvar.', campos: error.message.includes('RENAVAM') ? { renavam: 'Renavam inválido.' } : undefined };
  revalidatePath(`/loja/os/${numero}`);
  return { ok: true };
}

export async function justificarAtraso(osId: string, numero: number, motivoId: string, texto: string): Promise<Resultado> {
  const s = await sessaoValida();
  if (s.perfil.perfil !== 'loja') return { ok: false, erro: 'Sem permissão.' };
  if (!z.string().uuid().safeParse(motivoId).success) return { ok: false, erro: 'Escolha o motivo do atraso.', campos: { motivo: 'Escolha o motivo do atraso.' } };
  if (texto.trim().length < 5) return { ok: false, erro: 'Explique o atraso em poucas palavras.', campos: { texto: 'Explique o atraso em poucas palavras.' } };
  const supabase = await createClient();
  const { error } = await supabase.rpc('justificar_atraso', { p_os: osId, p_motivo: motivoId, p_texto: texto.trim() });
  if (error) return { ok: false, erro: error.message.includes('OS_ENCERRADA') ? 'A OS já foi encerrada.' : 'Não foi possível salvar a justificativa.' };
  revalidatePath(`/loja/os/${numero}`);
  return { ok: true };
}
