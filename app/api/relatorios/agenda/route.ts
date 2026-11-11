import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { dataHora } from '@/lib/formato';
import { gerarPdfRelatorio, type ColunaPdf } from '@/lib/pdf/relatorio';
import { gerarXlsx } from '@/lib/planilha';
import { descreverFiltrosAgenda, montarRelatorioAgenda, normalizarFiltrosAgenda, opcoesAgenda, type FiltrosAgenda } from '@/lib/agenda-relatorio';
import { AGRUPAR_AGENDA } from '@/lib/regras/agenda-relatorio';
import { formatarPct } from '@/lib/regras/relatorios';
import { getSessao } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

async function logo(origem: string): Promise<Buffer | null> {
  try { return await readFile(path.join(process.cwd(), 'public/brand/logo-colorido.png')); } catch { /* sem o arquivo no pacote */ }
  try { const r = await fetch(`${origem}/brand/logo-colorido.png`); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; } catch { return null; }
}

/** Relatório da agenda (só Loja) em Excel (agendamentos + resumo) ou PDF. */
export async function GET(req: NextRequest) {
  const s = await getSessao();
  if (!s || s.perfil.deve_trocar_senha || s.perfil.perfil !== 'loja') return NextResponse.json({ erro: 'não autenticado' }, { status: 401 });
  const params = Object.fromEntries(req.nextUrl.searchParams) as FiltrosAgenda & { formato?: string };
  const f = normalizarFiltrosAgenda(params);
  const sb = await createClient();
  const [op, rel] = await Promise.all([opcoesAgenda(sb), montarRelatorioAgenda(sb, f)]);
  const filtros = descreverFiltrosAgenda(f, op);
  const dim = AGRUPAR_AGENDA[f.agrupar];
  const geradoEm = dataHora(new Date());
  const t = rel.totais;
  const nome = `relatorio-agenda-${f.de}-a-${f.ate}`;
  const resumo = (g: typeof t) => [g.rotulo, g.total, g.realizadas, g.agendadas, g.naoRealizadas, g.frustradas, g.canceladas];

  if (params.formato === 'pdf') {
    const colR: ColunaPdf[] = [{ titulo: dim, largura: 30 }, { titulo: 'Agendadas', largura: 10, direita: true }, { titulo: 'Realizadas', largura: 10, direita: true }, { titulo: 'A realizar', largura: 10, direita: true }, { titulo: 'Não realizadas', largura: 11, direita: true }, { titulo: 'Frustradas', largura: 10, direita: true }, { titulo: 'Canceladas', largura: 9, direita: true }, { titulo: '% realizadas', largura: 10, direita: true }];
    const colD: ColunaPdf[] = [{ titulo: 'Dia e hora', largura: 15 }, { titulo: 'Vistoriador', largura: 16 }, { titulo: 'OS', largura: 6 }, { titulo: 'Placa', largura: 9 }, { titulo: 'Cliente', largura: 16 }, { titulo: 'Local', largura: 24 }, { titulo: 'Situação', largura: 14 }];
    const pdf = await gerarPdfRelatorio({
      titulo: 'Relatório da agenda', filtros, geradoEm, logo: await logo(req.nextUrl.origin),
      kpis: [{ rotulo: 'Agendadas', valor: String(t.total) }, { rotulo: 'Realizadas', valor: String(t.realizadas) }, { rotulo: 'A realizar', valor: String(t.agendadas) }, { rotulo: 'Não realizadas', valor: String(t.naoRealizadas) }, { rotulo: '% realizadas', valor: formatarPct(t.pctRealizadas) }],
      resumo: {
        titulo: `Resumo por ${dim.toLowerCase()}`, colunas: colR,
        linhas: rel.grupos.map((g) => [...resumo(g).map(String), formatarPct(g.pctRealizadas)]),
        total: [...resumo(t).map(String), formatarPct(t.pctRealizadas)],
      },
      detalhe: {
        titulo: `Agendamentos (${rel.linhas.length})`, colunas: colD,
        linhas: rel.linhas.map((l) => [dataHora(l.data_hora), l.vistoriador ?? '', String(l.numero), l.placa, l.cliente ?? '', l.local ?? l.patio ?? '', l.situacao]),
      },
    });
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nome}.pdf"`, 'Cache-Control': 'no-store' } });
  }

  const buf = await gerarXlsx([
    {
      nome: 'Agendamentos',
      colunas: [{ titulo: 'DIA E HORA', largura: 18 }, { titulo: 'VISTORIADOR', largura: 22 }, { titulo: 'OS', largura: 8 }, { titulo: 'PLACA', largura: 11 }, { titulo: 'CLIENTE', largura: 24 }, { titulo: 'PÁTIO', largura: 24 }, { titulo: 'LOCAL', largura: 30 }, { titulo: 'SITUAÇÃO', largura: 16 }],
      linhas: rel.linhas.map((l) => [dataHora(l.data_hora), l.vistoriador ?? '', l.numero, l.placa, l.cliente ?? '', l.patio ?? '', l.local ?? '', l.situacao]),
    },
    {
      nome: 'Resumo',
      colunas: [{ titulo: dim.toUpperCase(), largura: 30 }, { titulo: 'AGENDADAS', largura: 11 }, { titulo: 'REALIZADAS', largura: 11 }, { titulo: 'A REALIZAR', largura: 11 }, { titulo: 'NÃO REALIZADAS', largura: 14 }, { titulo: 'FRUSTRADAS', largura: 11 }, { titulo: 'CANCELADAS', largura: 11 }, { titulo: '% REALIZADAS', largura: 13, formato: '0.0%' }],
      linhas: [
        ...rel.grupos.map((g) => [...resumo(g), g.pctRealizadas === null ? null : g.pctRealizadas / 100]),
        [...resumo({ ...t, rotulo: 'TOTAL' }), t.pctRealizadas === null ? null : t.pctRealizadas / 100],
        [], ['Relatório da agenda'], ...filtros.map((x) => [x]),
        ['% realizadas = realizadas ÷ (realizadas + não realizadas + frustradas), sem contar as que ainda estão por vir e as canceladas.'],
        [`Gerado em ${geradoEm} · Sistema de OS – Auto Visão`],
      ],
    },
  ]);
  return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nome}.xlsx"`, 'Cache-Control': 'no-store' } });
}
