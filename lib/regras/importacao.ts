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
  // Modelo novo (planilha de controle)
  data: ['data', 'data de abertura', 'data abertura', 'data da solicitacao', 'data de solicitacao', 'data do pedido'],
  unidade: ['cliente', 'unidade', 'filial'],
  solicitante: ['solicitacao', 'solicitante', 'nome do solicitante'],
  telefone: ['telefone', 'celular', 'whatsapp'],
  ano: ['ano modelo', 'ano', 'ano fabricacao modelo'],
  cor: ['cor'],
  valor: ['valor', 'preco', 'valor do servico'],
  deslocamento: ['deslocamento', 'taxa de deslocamento'],
  forma: ['forma de pagamento', 'forma pagamento'],
  pagamento: ['pagamento efetuado', 'pagamento', 'situacao do pagamento'],
  status: ['status', 'status da os', 'situacao'],
};

/** Campos lidos de cada linha (texto como veio da planilha). */
export interface Bruto {
  placa: string; modelo: string; renavam: string; patio: string; servico: string; obs: string;
  data?: string; unidade?: string; solicitante?: string; telefone?: string; ano?: string; cor?: string;
  valor?: string; deslocamento?: string; forma?: string; pagamento?: string; status?: string;
}
export const CAMPOS_EXTRAS = ['data', 'unidade', 'solicitante', 'telefone', 'ano', 'cor', 'valor', 'deslocamento', 'forma', 'pagamento', 'status'] as const;

/** “*”, “-”, “—” e “n/a” na planilha significam vazio. */
const semValor = (v: string | undefined) => { const t = (v ?? '').trim(); return /^(\*+|-+|—|n\/?a|nao informado)$/i.test(t) ? '' : t; };

/** Data dd/mm/aaaa, aaaa-mm-dd ou data do Excel → aaaa-mm-dd. */
export function lerData(v: string | undefined): string | null | undefined {
  const t = semValor(v);
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { const a = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return undefined; // inválida
}

/** “R$ 90,00”, “90”, “1.234,56” → número. Vazio → null; inválido → undefined. */
export function lerValor(v: string | undefined): number | null | undefined {
  const t = semValor(v).replace(/r\$\s*/i, '').replace(/\s/g, '');
  if (!t) return null;
  const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
}

export type StatusOs = 'a_vistoriar' | 'frustrado' | 'vistoriado' | 'cancelado';
export function lerStatus(v: string | undefined): StatusOs | null | undefined {
  const n = normalizarNome(semValor(v));
  if (!n) return null;
  if (/^(a )?vistoriar$|^aberta?$|^pendente$|^em andamento$/.test(n)) return 'a_vistoriar';
  if (/^vistoriad[oa]$|^concluid[oa]$|^finalizad[oa]$/.test(n)) return 'vistoriado';
  if (/^frustrad[oa]$/.test(n)) return 'frustrado';
  if (/^cancelad[oa]$/.test(n)) return 'cancelado';
  return undefined;
}

export type StatusPagamentoPlanilha = 'pendente' | 'pago' | 'faturado';
export function lerPagamento(v: string | undefined): StatusPagamentoPlanilha | null | undefined {
  const n = normalizarNome(semValor(v));
  if (!n) return null;
  if (/^pago|^quitado|^recebido/.test(n)) return 'pago';
  if (/^faturad/.test(n)) return 'faturado';
  if (/^pendente|^em aberto|^a receber|^nao pago/.test(n)) return 'pendente';
  if (/^cancelad/.test(n)) return 'pendente';
  return undefined;
}

/** Forma de pagamento da planilha → código do sistema (texto original guardado à parte). */
export function lerForma(v: string | undefined): string | null {
  const t = semValor(v);
  const n = normalizarNome(t);
  if (!n) return null;
  if (n.includes('pix')) return 'pix';
  if (/credito|debito|cartao/.test(n)) return 'cartao';
  if (n.includes('dinheiro')) return 'dinheiro';
  if (n.includes('boleto')) return 'boleto';
  if (n.includes('transfer') || n.includes('ted') || n.includes('doc')) return 'transferencia';
  if (/futuro|faturad|faturamento|mensal/.test(n)) return 'faturamento';
  return t.slice(0, 60);
}

const GENERICAS = new Set(['freitas', 'leilo', 'leilomaster', 'leiloes', 'leilao', 'patio', 'sp', 'de', 'do', 'da', 'dos', 'das']);

/**
 * Pátio pela unidade do cliente (ex.: “Despachante Dukar SP Utinga” → Freitas Utinga): procura, no nome da unidade,
 * o nome distintivo do pátio (sem “Freitas”, “Leilo”…), um apelido ou, em último caso, a cidade. Só aceita se for único.
 */
export function acharPatioPorUnidade(unidade: string, ref: Referencias['patios']): string | null {
  const u = ` ${normalizarNome(unidade)} `;
  if (!u.trim()) return null;
  const contem = (chave: string) => !!chave && u.includes(` ${chave} `);
  const distintivo = (nome: string) => normalizarNome(nome).split(' ').filter((w) => !GENERICAS.has(w)).join(' ');
  const porNome = ref.filter((p) => contem(distintivo(p.nome)) || p.apelidos.some((a) => contem(normalizarNome(a))));
  if (porNome.length === 1) return porNome[0].id;
  if (porNome.length > 1) return null;
  const porCidade = ref.filter((p) => p.cidade && contem(normalizarNome(p.cidade)));
  return porCidade.length === 1 ? porCidade[0].id : null;
}

export interface Referencias {
  patios: { id: string; nome: string; apelidos: string[]; cidade?: string | null }[];
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
  // Modelo novo
  unidade: string | null;
  data_planilha: string | null;
  nome_solicitante: string | null;
  telefone: string | null;
  ano: string | null;
  cor: string | null;
  valor: number | null;
  deslocamento: number | null;
  pagamento_forma: string | null;
  pagamento_forma_original: string | null;
  pagamento_status: StatusPagamentoPlanilha | null;
  status_os: StatusOs | null;
}

export interface Analise {
  linhas: LinhaAnalisada[];
  erroArquivo?: string;
  contadores: { total: number; prontas: number; comErro: number; duplicadas: number; corrigidas: number };
}

const texto = (c: Celula) => {
  if (c === null || c === undefined) return '';
  // Datas do Excel chegam como meia-noite UTC: a data do calendário é a parte UTC
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
  bruto: Bruto,
  ref: Referencias,
  placasAnteriores: Map<string, number> = new Map(),
  linha = 0,
): Omit<LinhaAnalisada, 'linha' | 'dados_originais'> {
  const mensagens: string[] = [];
  const avisos: string[] = [];
  let resultado: LinhaAnalisada['resultado'] = 'ok';
  const placa = normalizarPlaca(bruto.placa);
  const corrigida = !!bruto.placa && placa !== bruto.placa.trim();
  if (!placa) { mensagens.push('Placa em branco.'); resultado = 'erro'; }
  else if (!placaValida(placa)) { mensagens.push(`Placa inválida (${bruto.placa}). Use AAA1234 ou AAA1A23.`); resultado = 'erro'; }

  const renDig = semValor(bruto.renavam).replace(/\D/g, '');
  let renavam: string | null = null;
  if (renDig) {
    if (renDig.length > 11 || !renavamValido(renDig)) { mensagens.push('Renavam inválido: o dígito verificador não confere.'); resultado = 'erro'; }
    else renavam = normalizarRenavam(renDig);
  }

  // Pátio: coluna PÁTIO (modelo antigo) ou reconhecido pela unidade do cliente (modelo novo)
  const unidade = semValor(bruto.unidade) || null;
  const patioTxt = semValor(bruto.patio);
  let patio_id: string | null = null;
  if (patioTxt) {
    patio_id = acharPatio(patioTxt, ref.patios);
    if (!patio_id) { mensagens.push(`Pátio não reconhecido: “${patioTxt}”. Escolha um pátio cadastrado.`); resultado = 'erro'; }
  } else if (unidade) {
    patio_id = acharPatioPorUnidade(unidade, ref.patios);
    if (!patio_id) { mensagens.push('Pátio não reconhecido pela unidade. Escolha o pátio.'); resultado = 'erro'; }
  } else { mensagens.push('Pátio em branco.'); resultado = 'erro'; }

  const servico_id = acharServico(semValor(bruto.servico), ref.servicos);
  if (servico_id === undefined) { mensagens.push(`Serviço não reconhecido: “${bruto.servico}”. Cadastre em Cadastros › Serviços ou escolha outro.`); resultado = 'erro'; }

  const data_planilha = lerData(bruto.data);
  if (data_planilha === undefined) { mensagens.push(`Data inválida: “${bruto.data}”. Use dd/mm/aaaa.`); resultado = 'erro'; }
  const valor = lerValor(bruto.valor), deslocamento = lerValor(bruto.deslocamento);
  if (valor === undefined) { mensagens.push(`Valor inválido: “${bruto.valor}”.`); resultado = 'erro'; }
  if (deslocamento === undefined) { mensagens.push(`Deslocamento inválido: “${bruto.deslocamento}”.`); resultado = 'erro'; }
  let status_os = lerStatus(bruto.status);
  if (status_os === undefined) { avisos.push(`Status “${bruto.status}” não reconhecido: entra como A vistoriar.`); status_os = null; }
  let pagamento_status = lerPagamento(bruto.pagamento);
  if (pagamento_status === undefined) { avisos.push(`Pagamento “${bruto.pagamento}” não reconhecido: entra como Pendente.`); pagamento_status = null; }
  const telDig = semValor(bruto.telefone).replace(/\D/g, '');

  if (resultado === 'ok' && placa) {
    const aberta = ref.abertas.get(placa);
    if (aberta) { mensagens.push(`Já tem a OS nº ${aberta} em aberto.`); resultado = 'duplicada'; }
    else if (placasAnteriores.has(placa)) { mensagens.push(`Placa repetida na linha ${placasAnteriores.get(placa)} da planilha.`); resultado = 'duplicada'; }
  }
  if (placa && !placasAnteriores.has(placa) && linha) placasAnteriores.set(placa, linha);
  if (corrigida && resultado !== 'erro') mensagens.unshift(`Placa corrigida: digitada “${bruto.placa.trim()}”.`);
  if (!patioTxt && unidade && patio_id && resultado !== 'erro') avisos.push(`Pátio pela unidade: ${ref.patios.find((p) => p.id === patio_id)?.nome}.`);

  return {
    placa_normalizada: placa, placa_corrigida: corrigida, renavam, modelo: semValor(bruto.modelo) || null,
    patio_id, servico_id: servico_id ?? null, observacao: semValor(bruto.obs) || null, resultado, mensagens: [...mensagens, ...avisos],
    unidade, data_planilha: data_planilha ?? null, nome_solicitante: semValor(bruto.solicitante) || null,
    telefone: telDig.length === 10 || telDig.length === 11 ? telDig : null,
    ano: semValor(bruto.ano) || null, cor: semValor(bruto.cor) || null,
    valor: valor ?? null, deslocamento: deslocamento ?? null,
    pagamento_forma: lerForma(bruto.forma), pagamento_forma_original: semValor(bruto.forma) || null,
    pagamento_status: pagamento_status ?? null, status_os: status_os ?? null,
  };
}

export function analisarPlanilha(linhas: Celula[][], ref: Referencias): Analise {
  const vazio = { total: 0, prontas: 0, comErro: 0, duplicadas: 0, corrigidas: 0 };
  const cab = mapearCabecalho(linhas);
  if (!cab) return { linhas: [], contadores: vazio, erroArquivo: 'Não encontramos a coluna PLACA. Use o modelo da importação.' };
  if (cab.colunas.patio === undefined && cab.colunas.unidade === undefined) return { linhas: [], contadores: vazio, erroArquivo: 'Não encontramos a coluna PÁTIO nem a coluna CLIENTE (unidade). Use o modelo da importação.' };
  const pega = (row: Celula[], campo: string) => (cab.colunas[campo] === undefined ? '' : texto(row[cab.colunas[campo]]));
  const vistas = new Map<string, number>();
  const saida: LinhaAnalisada[] = [];
  for (let i = cab.indice + 1; i < linhas.length; i++) {
    const row = linhas[i] ?? [];
    const bruto: Bruto = { placa: pega(row, 'placa'), modelo: pega(row, 'modelo'), renavam: pega(row, 'renavam'), patio: pega(row, 'patio'), servico: pega(row, 'servico'), obs: pega(row, 'obs') };
    for (const k of CAMPOS_EXTRAS) bruto[k] = pega(row, k);
    if (!semValor(bruto.placa) && !semValor(bruto.modelo) && !semValor(bruto.renavam) && !semValor(bruto.patio)) continue; // linha vazia
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
