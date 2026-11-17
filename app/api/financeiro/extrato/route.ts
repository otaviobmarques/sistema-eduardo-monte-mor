import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { buscarPagamentos } from '@/lib/financeiro';
import { gerarExtratoPdf } from '@/lib/pdf/extrato';
import { data as fmtData, moeda, STATUS_LABEL, telefone } from '@/lib/formato';
import { formatarCnpj } from '@/lib/regras/cnpj';
import { getSessao } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { gerarXlsx } from '@/lib/planilha';

export const runtime = 'nodejs';

async function logoAutoVisao(origem: string): Promise<Buffer | null> {
  try { return await readFile(path.join(process.cwd(), 'public/brand/logo-colorido.png')); } catch { /* sem o arquivo no pacote */ }
  try { const r = await fetch(`${origem}/brand/logo-colorido.png`); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; } catch { return null; }
}

/**
 * Extrato em PDF das placas a pagar de um cliente: todas as não canceladas com pagamento pendente (16/11/2026).
 * Cliente: o próprio. Loja: `?cliente=<id>` (RLS limita aos clientes dela). `?formato=xlsx` devolve o mesmo extrato em Excel.
 */
export async function GET(req: NextRequest) {
  const s = await getSessao();
  if (!s || s.perfil.bloqueado || s.perfil.deve_trocar_senha || (s.perfil.perfil !== 'loja' && s.perfil.perfil !== 'cliente')) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 });
  const empresaId = s.perfil.perfil === 'cliente' ? s.perfil.empresa_cliente_id! : req.nextUrl.searchParams.get('cliente') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(empresaId)) return NextResponse.json({ erro: 'Escolha o cliente.' }, { status: 400 });
  const sb = await createClient();
  const { data: e } = await sb.from('empresas_clientes').select('id, cnpj, razao_social, nome_fantasia, logo_path').eq('id', empresaId).maybeSingle();
  if (!e) return NextResponse.json({ erro: 'Cliente não encontrado.' }, { status: 404 });
  const [{ todas }, logo, { data: loja }] = await Promise.all([
    buscarPagamentos(sb, { cliente: empresaId, situacao: 'pendente' }),
    logoAutoVisao(req.nextUrl.origin),
    s.loja ? sb.from('lojas').select('nome, telefone').eq('id', s.loja.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const pend = todas.filter((l) => l.pagamento_status === 'pendente' && l.empresa_id === empresaId)
    .sort((a, b) => a.aberta_em.localeCompare(b.aberta_em) || a.numero - b.numero);
  const total = pend.reduce((t, l) => t + Math.round(l.valor * 100), 0) / 100;

  const nomeCli = e.nome_fantasia || e.razao_social;
  const base = `placas-a-pagar-${nomeCli.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;
  const geradoEm = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const situacao = (st: string) => STATUS_LABEL[st as keyof typeof STATUS_LABEL] ?? st;
  if (req.nextUrl.searchParams.get('formato') === 'xlsx') {
    const REAIS = '"R$" #,##0.00';
    const buf = await gerarXlsx([
      {
        nome: 'Placas a pagar',
        colunas: [
          { titulo: 'OS', largura: 8 }, { titulo: 'PLACA', largura: 11 }, { titulo: 'VEÍCULO', largura: 34 }, { titulo: 'ABERTURA', largura: 12 },
          { titulo: 'SITUAÇÃO', largura: 14 }, { titulo: 'CONCLUSÃO', largura: 12 }, { titulo: 'VALOR', largura: 14, formato: REAIS },
        ],
        linhas: [
          ...pend.map((l) => [l.numero, l.placa, l.marca_modelo ?? '', fmtData(l.aberta_em), situacao(l.status), l.concluida_em ? fmtData(l.concluida_em) : '', l.valor]),
          [], ['TOTAL A PAGAR', `${pend.length} ${pend.length === 1 ? 'placa' : 'placas'}`, '', '', '', '', total],
        ],
      },
      {
        nome: 'Resumo',
        colunas: [{ titulo: 'ITEM', largura: 24 }, { titulo: 'VALOR', largura: 44 }],
        linhas: [
          ['Cliente', nomeCli], ['CNPJ', formatarCnpj(e.cnpj)], ['Placas em aberto', pend.length], ['Total a pagar', moeda(total)],
          ['Loja', loja?.nome || s.loja?.nome || 'Auto Visão'], ['Gerado em', geradoEm],
          [], ['Placas com pagamento em aberto (vistoriadas, a vistoriar e frustradas), exceto as canceladas. Sistema de OS – Auto Visão'],
        ],
      },
    ]);
    return new NextResponse(new Uint8Array(buf), {
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${base}.xlsx"`, 'Cache-Control': 'no-store' },
    });
  }

  // Logotipo do cliente no extrato (PDF aceita PNG/JPG; WEBP fica de fora)
  let logoCliente: { data: Buffer; format: 'png' | 'jpg' } | null = null;
  if (e.logo_path && /\.(png|jpg)$/.test(e.logo_path)) {
    const { data: arq } = await createAdminClient().storage.from('logos').download(e.logo_path);
    if (arq) logoCliente = { data: Buffer.from(await arq.arrayBuffer()), format: e.logo_path.endsWith('.png') ? 'png' : 'jpg' };
  }
  const nome = e.nome_fantasia || e.razao_social;
  const lojaNome = loja?.nome || s.loja?.nome || 'Auto Visão';
  const pdf = await gerarExtratoPdf({
    logo, logoCliente, cliente: nome, cnpj: formatarCnpj(e.cnpj), loja: lojaNome,
    contatoLoja: loja?.telefone ? `${lojaNome} · ${telefone(loja.telefone)}` : lojaNome,
    geradoEm: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
    total: moeda(total), qtd: pend.length,
    linhas: pend.map((l) => ({
      numero: l.numero, placa: l.placa, veiculo: l.marca_modelo ?? '—', abertura: fmtData(l.aberta_em),
      situacao: STATUS_LABEL[l.status as keyof typeof STATUS_LABEL] ?? l.status, conclusao: l.concluida_em ? fmtData(l.concluida_em) : '—', valor: moeda(l.valor),
    })),
  });
  const arquivo = `placas-a-pagar-${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${arquivo}"`, 'Cache-Control': 'no-store' },
  });
}
