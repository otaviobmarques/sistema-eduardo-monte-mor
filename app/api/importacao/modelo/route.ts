import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const COLUNAS: { titulo: string; largura: number; usada: boolean; ajuda: string }[] = [
  { titulo: 'Data', largura: 12, usada: true, ajuda: 'Data da solicitação (dd/mm/aaaa). Na importação feita pela Auto Visão vira a data de abertura da OS.' },
  { titulo: 'Qtd', largura: 6, usada: false, ajuda: 'Contador da planilha. Ignorado.' },
  { titulo: 'Tipo de Cliente', largura: 18, usada: false, ajuda: 'Particular ou Empresa Cadastrada. Ignorado: o cliente é o escolhido no envio.' },
  { titulo: 'Cliente', largura: 38, usada: true, ajuda: 'Unidade/filial (ex.: Despachante Dukar SP Utinga). Fica gravada na OS e define o pátio pelo nome.' },
  { titulo: 'Solicitação', largura: 16, usada: true, ajuda: 'Nome de quem pediu a vistoria. Em branco, vale o nome informado no envio.' },
  { titulo: 'Telefone', largura: 16, usada: true, ajuda: 'Telefone de contato com DDD (opcional; * = em branco).' },
  { titulo: 'CPF', largura: 8, usada: false, ajuda: 'Não é usado: o sistema não guarda dados pessoais do proprietário (LGPD).' },
  { titulo: 'CEP', largura: 8, usada: false, ajuda: 'Ignorado.' },
  { titulo: 'Placa', largura: 11, usada: true, ajuda: 'Obrigatória. Pode vir com hífen ou minúscula; o sistema corrige.' },
  { titulo: 'Veículo', largura: 32, usada: true, ajuda: 'Marca e modelo, como vier.' },
  { titulo: 'Renavam', largura: 14, usada: true, ajuda: 'Opcional. Se vier, o dígito verificador é conferido.' },
  { titulo: 'Ano / Modelo', largura: 12, usada: true, ajuda: 'Opcional (* = em branco).' },
  { titulo: 'Cor', largura: 10, usada: true, ajuda: 'Opcional (* = em branco).' },
  { titulo: 'Serviço', largura: 26, usada: true, ajuda: 'Nome do serviço cadastrado (lista ao lado). Em branco = serviço padrão.' },
  { titulo: 'Valor', largura: 11, usada: true, ajuda: 'Valor da vistoria. Vale na importação feita pela Auto Visão; em branco, usa a tabela de preços.' },
  { titulo: 'Deslocamento', largura: 13, usada: true, ajuda: 'Taxa de deslocamento (opcional).' },
  { titulo: 'Forma de Pagamento', largura: 20, usada: true, ajuda: 'Pix, cartão, dinheiro, boleto ou “Futuro” (faturado). Usada quando o pagamento está como Pago.' },
  { titulo: 'Pagamento Efetuado', largura: 18, usada: true, ajuda: 'Pago, Pendente ou Cancelado. Vale na importação feita pela Auto Visão.' },
  { titulo: 'Coluna12', largura: 8, usada: false, ajuda: 'Ignorada.' },
  { titulo: 'Status', largura: 14, usada: true, ajuda: 'A Vistoriar, Vistoriado, Frustrado ou Cancelado. Vale na importação feita pela Auto Visão; o cliente sempre abre como A Vistoriar.' },
  { titulo: 'Fotos', largura: 7, usada: false, ajuda: '✅/❌. Ignorado (as fotos vão como anexo na OS).' },
  { titulo: 'CRLV', largura: 7, usada: false, ajuda: '✅/❌. Ignorado.' },
  { titulo: 'Obs.', largura: 36, usada: true, ajuda: 'Observação. Numa linha Frustrada ou Cancelada, vira a descrição do motivo.' },
];
const FORMAS = ['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Boleto', 'Transferência', 'Futuro'];
const PAGAMENTOS = ['Pago', 'Pendente', 'Cancelado'];
const STATUS = ['A Vistoriar', 'Vistoriado', 'Frustrado', 'Cancelado'];
const TIPOS = ['Empresa Cadastrada', 'Particular'];

/** Planilha modelo da importação em lote (formato da planilha de controle). Listas vêm do cadastro da Loja. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 });
  const [{ data: patios }, { data: apelidos }, { data: servicos }] = await Promise.all([
    supabase.from('patios').select('id, nome, cidade, uf').eq('ativo', true).order('nome'),
    supabase.from('patio_apelidos').select('patio_id, apelido'),
    supabase.from('servicos').select('nome, padrao').eq('ativo', true).order('nome'),
  ]);
  const nomesServ = (servicos ?? []).map((s) => s.nome);
  const padrao = servicos?.find((s) => s.padrao)?.nome ?? nomesServ[0] ?? 'Vistoria cautelar';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema de OS – Auto Visão';
  const ws = wb.addWorksheet('Planilha', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUNAS.map((c) => ({ header: c.titulo, width: c.largura }));
  const cab = ws.getRow(1);
  cab.height = 22;
  COLUNAS.forEach((c, i) => {
    const cel = cab.getCell(i + 1);
    cel.font = { bold: true, color: { argb: c.usada ? 'FFFFFFFF' : 'FFDED8DC' } };
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.usada ? 'FF373435' : 'FF8C8288' } };
    cel.alignment = { vertical: 'middle' };
    cel.note = c.ajuda;
  });
  const hoje = new Date(); const d = (n: number) => new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - n));
  const exemplo = (data: Date, qtd: number, unidade: string, placa: string, veiculo: string, renavam: string, pag: string, status: string, obs: string) =>
    [data, qtd, 'Empresa Cadastrada', unidade, 'Pedro', '*', '*', '*', placa, veiculo, renavam, '*', '*', padrao, 90, null, 'Futuro', pag, null, status, status === 'Vistoriado' ? '✅' : '❌', status === 'Vistoriado' ? '✅' : '❌', obs];
  ws.addRow(exemplo(d(2), 1, 'Despachante Dukar SP Utinga', 'ABC1D23', 'FIAT/STRADA FIRE FLEX', '00639018807', 'Pago', 'Vistoriado', 'Apague as linhas de exemplo'));
  ws.addRow(exemplo(d(1), 2, 'Despachante Dukar SP Santa Barbara', 'EUI6776', 'FORD/KA SE 1.0 HA', '', 'Pendente', 'A Vistoriar', ''));
  ws.getColumn(1).numFmt = 'dd/mm/yyyy';
  ws.getColumn(15).numFmt = '"R$" #,##0.00';
  ws.getColumn(16).numFmt = '"R$" #,##0.00';
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS.length } };

  // Listas para as caixas de seleção
  const ls = wb.addWorksheet('Listas');
  const listas: [string, string[]][] = [['Serviço', nomesServ.length ? nomesServ : [padrao]], ['Status', STATUS], ['Pagamento Efetuado', PAGAMENTOS], ['Forma de Pagamento', FORMAS], ['Tipo de Cliente', TIPOS], ['Fotos / CRLV', ['✅', '❌']]];
  listas.forEach(([titulo, itens], i) => {
    const col = ls.getColumn(i + 1); col.width = 26;
    ls.getCell(1, i + 1).value = titulo; ls.getCell(1, i + 1).font = { bold: true };
    itens.forEach((v, j) => { ls.getCell(j + 2, i + 1).value = v; });
  });
  const faixa = (i: number) => { const letra = String.fromCharCode(65 + i); return `Listas!$${letra}$2:$${letra}$${listas[i][1].length + 1}`; };
  const validar = (colPlanilha: number, iLista: number) => {
    const letra = ws.getColumn(colPlanilha).letter;
    (ws as unknown as { dataValidations: { add: (faixa: string, v: ExcelJS.DataValidation) => void } }).dataValidations.add(`${letra}2:${letra}501`, {
      type: 'list', allowBlank: true, formulae: [faixa(iLista)], showErrorMessage: true,
      errorTitle: 'Valor fora da lista', error: 'Escolha um valor da lista (aba Listas).',
    });
  };
  validar(14, 0); validar(20, 1); validar(18, 2); validar(17, 3); validar(3, 4); validar(21, 5); validar(22, 5);

  // Instruções
  const ins = wb.addWorksheet('Instruções');
  ins.getColumn(1).width = 22; ins.getColumn(2).width = 110;
  const linhaIns = (a: string, b = '', negrito = false) => { const r = ins.addRow([a, b]); if (negrito) r.font = { bold: true }; r.alignment = { wrapText: true, vertical: 'top' }; };
  linhaIns('Importação em lote · Sistema de OS – Auto Visão', '', true);
  linhaIns('');
  linhaIns('Como usar', 'Preencha a aba Planilha (uma linha por placa, até 500) ou envie a sua planilha de controle como está: o sistema acha o cabeçalho sozinho.');
  linhaIns('', 'Colunas em cinza são ignoradas. “*” numa célula significa em branco.');
  linhaIns('Quem envia', 'Cliente: todas as linhas viram OS novas “A Vistoriar”, com abertura no momento do envio e valor pela tabela de preços.');
  linhaIns('', 'Auto Visão (Gestor): a planilha vira histórico. Valem a Data, o Status, o Pagamento e o Valor de cada linha.');
  linhaIns('Pátio', 'É reconhecido pelo nome da unidade na coluna Cliente. Pátios cadastrados:');
  for (const p of patios ?? []) {
    const ap = (apelidos ?? []).filter((a) => a.patio_id === p.id).map((a) => a.apelido);
    linhaIns(`  ${p.nome}`, [p.cidade && `${p.cidade}${p.uf ? `/${p.uf}` : ''}`, ap.length ? `também aceito como: ${ap.join(', ')}` : ''].filter(Boolean).join(' · '));
  }
  linhaIns('', 'Se a unidade não indicar o pátio (ex.: Vila Guilherme), a linha aparece na prévia para escolher o pátio.');
  linhaIns('');
  linhaIns('Colunas', '', true);
  for (const c of COLUNAS) linhaIns(c.titulo, `${c.usada ? '' : '(ignorada) '}${c.ajuda}`);

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="planilha-modelo-importacao-auto-visao.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
