import { normalizarPlaca, placaValida } from './placa';
import { normalizarRenavam, renavamValido } from './renavam';

export const MAX_LINHAS = 500;
export type Celula = string | number | boolean | Date | null | undefined;

export const normalizarNome = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const CABECALHOS: Record<string, string[]> = {
  placa: ['placa'],
  modelo: ['modelo', 'marca modelo', 'marca e modelo', 'veiculo'],
  renavam: ['renavam'],
  patio: ['patio', 'local', 'patio de leilao'],
  servico: ['servico', 'tipo de servico'],
  obs: ['obs', 'observacao', 'observacoes'],
};

export interface Referencias {
  patios: { id: string; nome: string; apelidos: string[] }[];
  servicos: { id: string; nome: string; padrao: boolean }[];
  /** placa normalizada → nº da OS em aberto (a vistoriar ou frustrada) do mesmo cliente */
  abertas: Map<string, number>;
}

export interface LinhaAnalisada {
  linha: number; // número da linha na planilha (1 = primeira)
  dados_originais: Record<string, string>;
  placa_normalizada: string;
  placa_corrigida: boolean;
  renavam: string | null;
  modelo: string | null;
  patio_id: string | null;
  servico_id: string | null;
  observacao: string | null;
  resultado: 'ok' | 'erro' | 'duplicada';
  mensagens: string[];
}

export interface Analise {
  linhas: LinhaAnalisada[];
  erroArquivo?: string;
  contadores: { total: number; prontas: number; comErro: number; duplicadas: number; corrigidas: number };
}

const texto = (c: Celula) => {
  if (c === null || c === undefined) return '';
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
};

/** Localiza a linha de cabeçalho (com a coluna PLACA) nas primeiras 30 linhas e mapeia as colunas conhecidas. */
export function mapearCabecalho(linhas: Celula[][]): { indice: number; colunas: Record<string, number> } | null {
  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    const nomes = linhas[i].map((c) => normalizarNome(c));
    const iPlaca = nomes.findIndex((n) => CABECALHOS.placa.includes(n));
    if (iPlaca < 0) continue;
    const colunas: Record<string, number> = {};
    for (const [campo, apelidos] of Object.entries(CABECALHOS)) {
      const j = nomes.findIndex((n) => apelidos.includes(n));
      if (j >= 0) colunas[campo] = j;
    }
    return { indice: i, colunas };
  }
  return null;
}

export function acharPatio(valor: string, ref: Referencias['patios']): string | null {
  const n = normalizarNome(valor);
  if (!n) return null;
  for (const p of ref) if (normalizarNome(p.nome) === n || p.apelidos.some((a) => normalizarNome(a) === n)) return p.id;
  return null;
}

export function acharServico(valor: string, ref: Referencias['servicos']): string | null | undefined {
  const n = normalizarNome(valor);
  if (!n) return ref.find((s) => s.padrao)?.id ?? null; // vazio → serviço padrão
  return ref.find((s) => normalizarNome(s.nome) === n)?.id; // undefined = não reconhecido
}

/** Valida uma linha (usada na análise e na correção pela prévia). */
export function validarLinha(
  bruto: { placa: string; modelo: string; renavam: string; patio: string; servico: string; obs: string },
  ref: Referencias,
  placasAnteriores: Map<string, number> = new Map(),
  linha = 0,
): Omit<LinhaAnalisada, 'linha' | 'dados_originais'> {
  const mensagens: string[] = [];
  let resultado: LinhaAnalisada['resultado'] = 'ok';
  const placa = normalizarPlaca(bruto.placa);
  const corrigida = !!bruto.placa && placa !== bruto.placa.trim();
  if (!placa) { mensagens.push('Placa em branco.'); resultado = 'erro'; }
  else if (!placaValida(placa)) { mensagens.push(`Placa inválida (${bruto.placa}). Use AAA1234 ou AAA1A23.`); resultado = 'erro'; }

  const renDig = bruto.renavam.replace(/\D/g, '');
  let renavam: string | null = null;
  if (renDig) {
    if (renDig.length > 11 || !renavamValido(renDig)) { mensagens.push('Renavam inválido: o dígito verificador não confere.'); resultado = 'erro'; }
    else renavam = normalizarRenavam(renDig);
  }

  const patio_id = acharPatio(bruto.patio, ref.patios);
  if (!bruto.patio) { mensagens.push('Pátio em branco.'); resultado = 'erro'; }
  else if (!patio_id) { mensagens.push(`Pátio não reconhecido: “${bruto.patio}”. Escolha um pátio cadastrado.`); resultado = 'erro'; }

  const servico_id = acharServico(bruto.servico, ref.servicos);
  if (servico_id === undefined) { mensagens.push(`Serviço não reconhecido: “${bruto.servico}”.`); resultado = 'erro'; }

  if (resultado === 'ok' && placa) {
    const aberta = ref.abertas.get(placa);
    if (aberta) { mensagens.push(`Já tem a OS nº ${aberta} em aberto.`); resultado = 'duplicada'; }
    else if (placasAnteriores.has(placa)) { mensagens.push(`Placa repetida na linha ${placasAnteriores.get(placa)} da planilha.`); resultado = 'duplicada'; }
  }
  if (placa && !placasAnteriores.has(placa) && linha) placasAnteriores.set(placa, linha);
  if (corrigida && resultado !== 'erro') mensagens.unshift(`Placa corrigida: digitada “${bruto.placa.trim()}”.`);

  return {
    placa_normalizada: placa, placa_corrigida: corrigida, renavam, modelo: bruto.modelo || null,
    patio_id, servico_id: servico_id ?? null, observacao: bruto.obs || null, resultado, mensagens,
  };
}

export function analisarPlanilha(linhas: Celula[][], ref: Referencias): Analise {
  const vazio = { total: 0, prontas: 0, comErro: 0, duplicadas: 0, corrigidas: 0 };
  const cab = mapearCabecalho(linhas);
  if (!cab) return { linhas: [], contadores: vazio, erroArquivo: 'Não encontramos a coluna PLACA. Use o modelo da importação.' };
  if (cab.colunas.patio === undefined) return { linhas: [], contadores: vazio, erroArquivo: 'Não encontramos a coluna PÁTIO. Use o modelo da importação.' };
  const pega = (row: Celula[], campo: string) => (cab.colunas[campo] === undefined ? '' : texto(row[cab.colunas[campo]]));
  const vistas = new Map<string, number>();
  const saida: LinhaAnalisada[] = [];
  for (let i = cab.indice + 1; i < linhas.length; i++) {
    const row = linhas[i] ?? [];
    const bruto = { placa: pega(row, 'placa'), modelo: pega(row, 'modelo'), renavam: pega(row, 'renavam'), patio: pega(row, 'patio'), servico: pega(row, 'servico'), obs: pega(row, 'obs') };
    if (!bruto.placa && !bruto.modelo && !bruto.renavam && !bruto.patio) continue; // linha vazia
    if (saida.length >= MAX_LINHAS) {
      return { linhas: [], contadores: vazio, erroArquivo: `A planilha tem mais de ${MAX_LINHAS} linhas. Divida em arquivos menores.` };
    }
    const dados_originais: Record<string, string> = {};
    for (const [k, v] of Object.entries(bruto)) if (v) dados_originais[k] = v;
    saida.push({ linha: i + 1, dados_originais, ...validarLinha(bruto, ref, vistas, i + 1) });
  }
  if (!saida.length) return { linhas: [], contadores: vazio, erroArquivo: 'A planilha não tem nenhuma linha com placa.' };
  return { linhas: saida, contadores: contar(saida) };
}

export function contar(l: Pick<LinhaAnalisada, 'resultado' | 'placa_corrigida'>[]) {
  return {
    total: l.length,
    prontas: l.filter((x) => x.resultado === 'ok').length,
    comErro: l.filter((x) => x.resultado === 'erro').length,
    duplicadas: l.filter((x) => x.resultado === 'duplicada').length,
    corrigidas: l.filter((x) => x.placa_corrigida).length,
  };
}

/** CSV simples: detecta ; ou , e respeita aspas. */
export function lerCsv(conteudo: string): string[][] {
  const texto = conteudo.replace(/^﻿/, '');
  const primeira = texto.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
  const linhas: string[][] = [];
  let atual: string[] = [], campo = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { atual.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      atual.push(campo); linhas.push(atual); atual = []; campo = '';
    } else campo += c;
  }
  if (campo || atual.length) { atual.push(campo); linhas.push(atual); }
  return linhas;
}
