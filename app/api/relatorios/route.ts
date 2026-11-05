import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { data as fmtData, dataHora, moeda, STATUS_LABEL } from '@/lib/formato';
import { gerarPdfRelatorio, type ColunaPdf } from '@/lib/pdf/relatorio';
import { gerarXlsx } from '@/lib/planilha';
import { descreverFiltros, montarRelatorio, normalizarFiltros, opcoesFiltro, type FiltrosRel } from '@/lib/relatorios';
import { formatarHoras, formatarPct, situacaoSla, TIPOS_RELATORIO } from '@/lib/regras/relatorios';
import { getSessao } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
const REAIS = '"R$" #,##0.00';
const PAG = { pendente: 'Pendente', pago: 'Pago', faturado: 'Faturado' } as const;

async function logo(origem: string): Promise<Buffer | null> {
  try { return await readFile(path.join(process.cwd(), 'public/brand/logo-colorido.png')); } catch { /* sem o arquivo no pacote */ }
  try { const r = await fetch(`${origem}/brand/logo-colorido.png`); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; } catch { return null; }
}

/** Exporta o relatório (Excel: aba de dados + resumo; PDF: logo, título, filtros, data e paginação). RLS do usuário. */
export async function GET(req: NextRequest) {
  const s = await getSessao();
  if (!s || s.perfil.deve_trocar_senha || (s.perfil.perfil !== 'loja' && s.perfil.perfil !== 'cliente')) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 });
  const modo = s.perfil.perfil === 'loja' ? 'loja' : 'cliente';
  const params = Object.fromEntries(req.nextUrl.searchParams) as FiltrosRel & { formato?: string };
  const f = normalizarFiltros(params, modo);
  const sb = await createClient();
  const [op, rel] = await Promise.all([opcoesFiltro(sb, modo), montarRelatorio(sb, f)]);
  const def = TIPOS_RELATORIO[f.tipo];
  const filtros = descreverFiltros(f, op);
  const geradoEm = dataHora(new Date());
  const k = rel.kpis;
  const loja = modo === 'loja';
  const nomeArq = `relatorio-${f.tipo}-${f.de}-a-${f.ate}`;
  const motivo = (l: (typeof rel.linhas)[number]) => [l.motivo_atraso && `Atraso: ${l.motivo_atraso}`, l.motivo_frustracao && `Frustração: ${l.motivo_frustracao}`, l.motivo_cancelamento && `Cancelamento: ${l.motivo_cancelamento}`].filter(Boolean).join(' · ');
  const somaValor = (pred: (l: (typeof rel.linhas)[number]) => boolean) => rel.linhas.filter(pred).reduce((a, l) => a + Math.round(Number(l.valor ?? 0) * 100), 0) / 100;
  const totais = {
    os: rel.linhas.length, vist: rel.linhas.filter((l) => l.status === 'vistoriado').length, frust: rel.linhas.filter((l) => l.foi_frustrada).length,
    canc: rel.linhas.filter((l) => l.status === 'cancelado').length, valor: somaValor((l) => l.status !== 'cancelado'), pend: somaValor((l) => l.status === 'vistoriado' && l.pagamento_status === 'pendente'),
  };

  if (params.formato === 'pdf') {
    const colR: ColunaPdf[] = [{ titulo: def.dimensao, largura: 28 }, { titulo: 'OS', largura: 7, direita: true }, { titulo: 'Vistoriadas', largura: 9, direita: true }, { titulo: 'No prazo', largura: 9, direita: true }, { titulo: 'Tempo médio', largura: 10, direita: true }, { titulo: 'Frustradas', largura: 9, direita: true }, { titulo: 'Canceladas', largura: 9, direita: true }, { titulo: 'Valor', largura: 10, direita: true }, { titulo: 'Pendente', largura: 9, direita: true }];
    const colD: ColunaPdf[] = [{ titulo: 'OS', largura: 6 }, { titulo: 'Placa', largura: 9 }, { titulo: 'Modelo', largura: 17 }, ...(loja ? [{ titulo: 'Cliente', largura: 13 }] : []), { titulo: 'Abertura', largura: 9 }, { titulo: 'Status', largura: 9 }, { titulo: 'Prazo', largura: 13 }, { titulo: 'Motivo', largura: loja ? 15 : 28 }, { titulo: 'Valor', largura: 9, direita: true }];
    const pdf = await gerarPdfRelatorio({
      titulo: `Relatório · ${def.titulo}`, filtros, geradoEm, logo: await logo(req.nextUrl.origin),
      kpis: [{ rotulo: 'Vistorias', valor: String(k.total) }, { rotulo: '% no prazo', valor: formatarPct(k.pctNoPrazo) }, { rotulo: 'Tempo médio', valor: formatarHoras(k.tempoMedioHoras) }, { rotulo: 'Frustração', valor: formatarPct(k.pctFrustradas) }, { rotulo: 'Cancelamento', valor: formatarPct(k.pctCanceladas) }],
      resumo: {
        titulo: `Resumo por ${def.dimensao.toLowerCase()}`, colunas: colR,
        linhas: rel.grupos.map((g) => [g.rotulo, String(g.a.total), String(g.a.vistoriadas), formatarPct(g.a.pctNoPrazo), formatarHoras(g.a.tempoMedioHoras), String(g.a.frustradas), String(g.a.canceladas), moeda(g.a.valor), moeda(g.a.pendente)]),
        total: ['Total', String(totais.os), String(totais.vist), formatarPct(k.pctNoPrazo), formatarHoras(k.tempoMedioHoras), String(totais.frust), String(totais.canc), moeda(totais.valor), moeda(totais.pend)],
      },
      detalhe: {
        titulo: `Placas (${rel.linhas.length})`, colunas: colD,
        linhas: rel.linhas.map((l) => [String(l.numero), l.placa, l.marca_modelo ?? '', ...(loja ? [l.cliente ?? ''] : []), fmtData(l.aberta_em), STATUS_LABEL[l.status], situacaoSla(l) + (l.horas_atraso ? ` (+${formatarHoras(Number(l.horas_atraso))})` : ''), motivo(l), moeda(l.valor)]),
      },
    });
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nomeArq}.pdf"`, 'Cache-Control': 'no-store' } });
  }

  const buf = await gerarXlsx([
    {
      nome: 'Dados',
      colunas: [
        { titulo: 'OS', largura: 8 }, { titulo: 'PLACA', largura: 11 }, { titulo: 'MODELO', largura: 30 }, ...(loja ? [{ titulo: 'CLIENTE', largura: 22 }] : []),
        { titulo: 'ABERTURA', largura: 17 }, { titulo: 'CONCLUSÃO', largura: 17 }, { titulo: 'PRAZO', largura: 17 }, { titulo: 'STATUS', largura: 12 }, { titulo: 'SITUAÇÃO DO PRAZO', largura: 22 },
        { titulo: 'HORAS ATÉ O LAUDO', largura: 12 }, { titulo: 'HORAS DE ATRASO', largura: 12 }, { titulo: 'CIDADE', largura: 20 }, { titulo: 'UF', largura: 5 }, { titulo: 'PÁTIO', largura: 24 },
        ...(loja ? [{ titulo: 'VISTORIADOR', largura: 20 }] : []), { titulo: 'FRUSTRADA', largura: 10 }, { titulo: 'MOTIVOS', largura: 40 },
        { titulo: 'VALOR', largura: 13, formato: REAIS }, { titulo: 'PAGAMENTO', largura: 11 },
      ],
      linhas: rel.linhas.map((l) => [
        l.numero, l.placa, l.marca_modelo ?? '', ...(loja ? [l.cliente ?? ''] : []), dataHora(l.aberta_em), l.concluida_em ? dataHora(l.concluida_em) : '', l.prazo_em ? dataHora(l.prazo_em) : '',
        STATUS_LABEL[l.status], situacaoSla(l), l.horas_conclusao === null ? null : Number(l.horas_conclusao), l.horas_atraso === null ? null : Number(l.horas_atraso),
        l.cidade ?? '', l.uf ?? '', l.patio ?? '', ...(loja ? [l.vistoriador ?? ''] : []), l.foi_frustrada ? 'Sim' : 'Não', motivo(l), Number(l.valor ?? 0), PAG[l.pagamento_status],
      ]),
    },
    {
      nome: 'Resumo',
      colunas: [{ titulo: def.dimensao.toUpperCase(), largura: 30 }, { titulo: 'OS', largura: 8 }, { titulo: 'VISTORIADAS', largura: 12 }, { titulo: 'NO PRAZO', largura: 10 }, { titulo: '% NO PRAZO', largura: 11, formato: '0.0%' }, { titulo: 'TEMPO MÉDIO (H)', largura: 15 }, { titulo: 'FRUSTRADAS', largura: 11 }, { titulo: 'CANCELADAS', largura: 11 }, { titulo: 'VALOR', largura: 14, formato: REAIS }, { titulo: 'PENDENTE', largura: 14, formato: REAIS }],
      linhas: [
        ...rel.grupos.map((g) => [g.rotulo, g.a.total, g.a.vistoriadas, g.a.noPrazo, g.a.pctNoPrazo === null ? null : g.a.pctNoPrazo / 100, g.a.tempoMedioHoras, g.a.frustradas, g.a.canceladas, g.a.valor, g.a.pendente]),
        ['TOTAL', totais.os, totais.vist, k.noPrazo, k.pctNoPrazo === null ? null : k.pctNoPrazo / 100, k.tempoMedioHoras, totais.frust, totais.canc, totais.valor, totais.pend],
        [],
        [`Relatório: ${def.titulo}`], ...filtros.map((t) => [t]),
        [`Índice de frustração: ${formatarPct(k.pctFrustradas)} · Índice de cancelamento: ${formatarPct(k.pctCanceladas)}`],
        [`Gerado em ${geradoEm} · Sistema de OS – Auto Visão`],
      ],
    },
  ]);
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nomeArq}.xlsx"`, 'Cache-Control': 'no-store' },
  });
}
