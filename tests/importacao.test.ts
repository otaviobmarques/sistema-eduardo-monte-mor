import { describe, expect, it } from 'vitest';
import { analisarPlanilha, lerCsv, mapearCabecalho, validarLinha, type Referencias } from '@/lib/regras/importacao';

const ref: Referencias = {
  patios: [
    { id: 'p-utinga', nome: 'Freitas Utinga', apelidos: ['Utinga'] },
    { id: 'p-sb', nome: 'Freitas Santa Bárbara', apelidos: ['Freitas S. Barbara'] },
    { id: 'p-sc', nome: 'Leilo São Carlos', apelidos: [] },
  ],
  servicos: [{ id: 's-cautelar', nome: 'Vistoria cautelar', padrao: true }, { id: 's-outra', nome: 'Vistoria de transferência', padrao: false }],
  abertas: new Map([['ABC1D23', 42]]),
};

// Mesma forma da planilha real da Creditas: 3 linhas de lixo, colunas extras, começa na coluna B
const creditas = [
  [null, null, null, null, null, null, null, null, 'ATENDIMENTO EM TODO TERRITÓRIO NACIONAL'],
  [null, null, null, null, null, null, null, null, 'ATENDIMENTO EM TODO TERRITÓRIO NACIONAL'],
  [],
  [null, 'QTD', 'PLACA', 'MODELO', 'RENAVAM', 'PÁTIO', 'STATUS', 'DATA DE SOLICITAÇÃO', 'SOLICITANTE', 'OBS', 'Coluna1'],
  [null, 1, 'EVI9901', 'CLASSIC', 325634475, 'Freitas Utinga', null, new Date('2026-11-03')],
  [null, 2, 'eui6776', 'I/KIA SOUL EX 1.6 FF AT', 300229895, 'Freitas Utinga'],
  [null, 3, 'bku1f22', 'FRONTIER CD ATTACK', 1210765664, 'Freitas Santa Barbara'],
  [null, 4, 'Etw4e99', 'GOLF', 336200064, 'Leilo São Carlos'],
  [null, null, null, null, null, null],
  [null, 5, 'ABC-1D23', 'GOL', null, 'utinga'],
  [null, 6, 'EVI9901', 'CLASSIC', 325634475, 'Freitas Utinga'],
  [null, 7, 'XX12', 'UNO', 123, 'Pátio Desconhecido'],
];

describe('importação em lote', () => {
  it('acha o cabeçalho na linha 4 e ignora colunas extras', () => {
    const c = mapearCabecalho(creditas);
    expect(c?.indice).toBe(3);
    expect(c?.colunas).toMatchObject({ placa: 2, modelo: 3, renavam: 4, patio: 5, obs: 9 });
    expect(c?.colunas).toMatchObject({ status: 6, data: 7, solicitante: 8 }); // colunas da Creditas agora reconhecidas
  });
  it('analisa a planilha no formato da Creditas', () => {
    const a = analisarPlanilha(creditas, ref);
    expect(a.erroArquivo).toBeUndefined();
    expect(a.linhas.map((l) => [l.linha, l.resultado])).toEqual([[5, 'ok'], [6, 'ok'], [7, 'ok'], [8, 'ok'], [10, 'duplicada'], [11, 'duplicada'], [12, 'erro']]);
    expect(a.contadores).toEqual({ total: 7, prontas: 4, comErro: 1, duplicadas: 2, corrigidas: 4 });
  });
  it('normaliza placa, Renavam e reconhece pátio sem acento ou por apelido', () => {
    const [l1, l2, l3] = analisarPlanilha(creditas, ref).linhas;
    expect(l1.renavam).toBe('00325634475');
    expect(l2.placa_normalizada).toBe('EUI6776');
    expect(l2.mensagens[0]).toBe('Placa corrigida: digitada “eui6776”.');
    expect(l2.dados_originais.placa).toBe('eui6776');
    expect(l3.patio_id).toBe('p-sb');
    expect(l1.servico_id).toBe('s-cautelar'); // serviço vazio → padrão
    expect(l1.modelo).toBe('CLASSIC'); // modelo aceito como veio
  });
  it('marca duplicidade com OS aberta e repetição na própria planilha', () => {
    const l = analisarPlanilha(creditas, ref).linhas;
    expect(l[4].mensagens).toContain('Já tem a OS nº 42 em aberto.');
    expect(l[5].mensagens).toContain('Placa repetida na linha 5 da planilha.');
  });
  it('acumula as mensagens de erro', () => {
    const e = analisarPlanilha(creditas, ref).linhas.at(-1)!;
    expect(e.mensagens).toEqual([
      'Placa inválida (XX12). Use AAA1234 ou AAA1A23.',
      'Renavam inválido: o dígito verificador não confere.',
      'Pátio não reconhecido: “Pátio Desconhecido”. Escolha um pátio cadastrado.',
    ]);
  });
  it('corrige uma linha na prévia', () => {
    const r = validarLinha({ placa: 'XYZ1234', modelo: 'UNO', renavam: '', patio: 'Leilo Sao Carlos', servico: 'vistoria de transferencia', obs: '' }, ref);
    expect(r.resultado).toBe('ok');
    expect(r.patio_id).toBe('p-sc');
    expect(r.servico_id).toBe('s-outra');
  });
  it('recusa planilha sem coluna de placa ou com mais de 500 linhas', () => {
    expect(analisarPlanilha([['A', 'B']], ref).erroArquivo).toMatch(/PLACA/);
    const grande = [['PLACA', 'PÁTIO'], ...Array.from({ length: 501 }, (_, i) => [`AAA${String(i).padStart(4, '0')}`, 'Utinga'])];
    expect(analisarPlanilha(grande, ref).erroArquivo).toMatch(/500/);
  });
  it('lê CSV com ponto e vírgula e aspas', () => {
    expect(lerCsv('PLACA;MODELO;PÁTIO\r\neui6776;"KIA; SOUL";Utinga\n')).toEqual([['PLACA', 'MODELO', 'PÁTIO'], ['eui6776', 'KIA; SOUL', 'Utinga']]);
    expect(lerCsv('placa,modelo\nABC1234,"Gol ""G5"""')).toEqual([['placa', 'modelo'], ['ABC1234', 'Gol "G5"']]);
  });
});
