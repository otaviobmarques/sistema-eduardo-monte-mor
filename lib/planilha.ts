import 'server-only';
import ExcelJS from 'exceljs';
import { lerCsv, type Celula } from './regras/importacao';

function valorCelula(v: ExcelJS.CellValue): Celula {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== 'object') return v as Celula;
  if ('richText' in v) return v.richText.map((t) => t.text).join('');
  if ('text' in v && typeof v.text === 'string') return v.text; // hyperlink
  if ('result' in v) return (v.result ?? null) as Celula; // fórmula
  if ('error' in v) return null;
  return String(v);
}

/** Lê a primeira aba com conteúdo de um .xlsx, ou um .csv, como matriz de células. */
export async function lerPlanilha(arquivo: File): Promise<Celula[][]> {
  const nome = arquivo.name.toLowerCase();
  const buf = Buffer.from(await arquivo.arrayBuffer());
  if (nome.endsWith('.csv') || arquivo.type === 'text/csv') {
    let texto = buf.toString('utf8');
    if (texto.includes('�')) texto = buf.toString('latin1'); // CSV salvo pelo Excel em Windows-1252
    return lerCsv(texto);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0) ?? wb.worksheets[0];
  const linhas: Celula[][] = [];
  ws?.eachRow({ includeEmpty: true }, (row, n) => {
    const valores = (row.values as ExcelJS.CellValue[]).slice(1).map(valorCelula);
    linhas[n - 1] = valores;
  });
  for (let i = 0; i < linhas.length; i++) linhas[i] ??= [];
  return linhas;
}

export async function gerarXlsx(abas: { nome: string; colunas: { titulo: string; largura?: number; formato?: string }[]; linhas: (string | number | null)[][] }[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema de OS – Auto Visão';
  for (const a of abas) {
    const ws = wb.addWorksheet(a.nome);
    ws.columns = a.colunas.map((c) => ({ header: c.titulo, width: c.largura ?? 18, style: c.formato ? { numFmt: c.formato } : undefined }));
    const cab = ws.getRow(1);
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF373435' } };
    a.linhas.forEach((l) => ws.addRow(l));
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
