import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { buscarOs, filtrarPorLocal, lerLocais, ordenarPorUrgencia } from '@/lib/fila';
import { data as fmtData, dataHora, ETAPA_LABEL, STATUS_LABEL } from '@/lib/formato';
import { gerarPdfRelatorio } from '@/lib/pdf/relatorio';
import { gerarXlsx } from '@/lib/planilha';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
const SLA = { vermelho: 'Vencida', amarelo: 'Vencendo', verde: 'No prazo', cinza: 'Pausada', encerrada: 'Encerrada' } as const;
const CHIP = { vencidas: 'vermelho', vencendo: 'amarelo', prazo: 'verde', pausadas: 'cinza' } as const;

/** Fila de OS em andamento (Loja), na ordem de urgência, em Excel ou PDF. */
export async function GET(req: NextRequest) {
  await exigirPerfil('loja');
  const sp = req.nextUrl.searchParams;
  const sb = await createClient();
  const locais = lerLocais(sp.getAll('local'));
  const { linhas: semLocal } = await buscarOs(sb, { status: ['a_vistoriar', 'frustrado'], q: sp.get('q') ?? '', limite: 1000 });
  const todas = filtrarPorLocal(semLocal, locais);
  const chip = CHIP[(sp.get('sla') ?? '') as keyof typeof CHIP];
  const linhas = ordenarPorUrgencia(chip ? todas.filter((o) => o.sla.cor === chip) : todas);
  const filtros = [`${linhas.length} OS em andamento`, sp.get('q') ? `Busca: ${sp.get('q')}` : null, chip ? `Prazo: ${SLA[chip]}` : null, locais.length ? `Unidade/Pátio: ${locais.map((l) => l.slice(2)).join(', ')}` : null].filter(Boolean) as string[];
  const dados = linhas.map((o) => ({
    o, etapa: o.status === 'a_vistoriar' && o.etapa ? ETAPA_LABEL[o.etapa as keyof typeof ETAPA_LABEL] : '',
    prazo: o.sla.prazo ? dataHora(o.sla.prazo) : 'Pausado', sla: `${SLA[o.sla.cor]} · ${o.sla.texto}`,
  }));

  if (sp.get('formato') === 'pdf') {
    let logo: Buffer | null = null;
    try { logo = await readFile(path.join(process.cwd(), 'public/brand/logo-colorido.png')); } catch { /* opcional */ }
    const n = (o: (typeof dados)[number]) => o.o.sla.cor;
    const pdf = await gerarPdfRelatorio({
      titulo: 'Fila de OS', filtros, geradoEm: dataHora(new Date()), logo,
      kpis: [{ rotulo: 'Em andamento', valor: String(dados.length) }, { rotulo: 'Vencidas', valor: String(dados.filter((d) => n(d) === 'vermelho').length) }, { rotulo: 'Vencendo', valor: String(dados.filter((d) => n(d) === 'amarelo').length) }, { rotulo: 'No prazo', valor: String(dados.filter((d) => n(d) === 'verde').length) }, { rotulo: 'Pausadas', valor: String(dados.filter((d) => n(d) === 'cinza').length) }],
      resumo: {
        titulo: 'Ordenada por urgência', colunas: [{ titulo: 'OS', largura: 6 }, { titulo: 'Placa', largura: 9 }, { titulo: 'Veículo', largura: 17 }, { titulo: 'Cliente', largura: 14 }, { titulo: 'Local', largura: 16 }, { titulo: 'Status', largura: 13 }, { titulo: 'Prazo', largura: 12 }, { titulo: 'SLA', largura: 13 }],
        linhas: dados.map((d) => [String(d.o.numero), d.o.placa, d.o.marca_modelo ?? '', d.o.cliente ?? '', [d.o.local, d.o.cidade].filter(Boolean).join(' · '), `${STATUS_LABEL[d.o.status as keyof typeof STATUS_LABEL]}${d.etapa ? ` · ${d.etapa}` : ''}`, d.prazo, d.sla]),
      },
    });
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="fila-de-os-${fmtData(new Date()).split('/').reverse().join('-')}.pdf"`, 'Cache-Control': 'no-store' } });
  }
  const buf = await gerarXlsx([
    {
      nome: 'Fila',
      colunas: [{ titulo: 'OS', largura: 8 }, { titulo: 'PLACA', largura: 11 }, { titulo: 'VEÍCULO', largura: 30 }, { titulo: 'CLIENTE', largura: 22 }, { titulo: 'SOLICITANTE', largura: 20 }, { titulo: 'LOCAL', largura: 26 }, { titulo: 'CIDADE', largura: 18 }, { titulo: 'STATUS', largura: 12 }, { titulo: 'ETAPA', largura: 20 }, { titulo: 'ABERTURA', largura: 17 }, { titulo: 'PRAZO', largura: 17 }, { titulo: 'SLA', largura: 26 }],
      linhas: dados.map((d) => [d.o.numero, d.o.placa, d.o.marca_modelo ?? '', d.o.cliente ?? '', d.o.nome_solicitante ?? '', d.o.local ?? '', d.o.cidade ?? '', STATUS_LABEL[d.o.status as keyof typeof STATUS_LABEL], d.etapa, dataHora(d.o.aberta_em), d.prazo, d.sla]),
    },
    {
      nome: 'Resumo',
      colunas: [{ titulo: 'SITUAÇÃO DO PRAZO', largura: 24 }, { titulo: 'OS', largura: 8 }],
      linhas: [...(Object.keys(SLA) as (keyof typeof SLA)[]).map((k) => [SLA[k], dados.filter((d) => d.o.sla.cor === k).length]), ['TOTAL', dados.length], [], ...filtros.map((t) => [t]), [`Gerado em ${dataHora(new Date())} · Sistema de OS – Auto Visão`]],
    },
  ]);
  return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="fila-de-os.xlsx"`, 'Cache-Control': 'no-store' } });
}
