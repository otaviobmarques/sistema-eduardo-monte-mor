import { describe, expect, it } from 'vitest';
import { acharPatioPorUnidade, analisarPlanilha, type Celula, lerData, lerForma, lerPagamento, lerStatus, lerValor, type Referencias } from '@/lib/regras/importacao';

const ref: Referencias = {
  patios: [
    { id: 'p-utinga', nome: 'Freitas Utinga', apelidos: [], cidade: 'Santo André' },
    { id: 'p-sb', nome: 'Freitas Santa Bárbara', apelidos: ['Freitas S. Barbara'], cidade: "Santa Bárbara d'Oeste" },
    { id: 'p-sc', nome: 'Leilo São Carlos', apelidos: [], cidade: 'São Carlos' },
    { id: 'p-lm', nome: 'Leilomaster SP', apelidos: [], cidade: 'São Paulo' },
  ],
  servicos: [{ id: 's-cautelar', nome: 'Vistoria cautelar', padrao: true }, { id: 's-mera', nome: 'Laudo Mera', padrao: false }, { id: 's-baixa', nome: 'Laudo Baixa Permanente', padrao: false }],
  abertas: new Map(),
};

// Mesma forma da planilha de controle (Dukar): totais em cima, cabeçalho na linha 7, coluna A vazia, “*” = em branco
const CAB = [null, 'Data', 'Qtd', 'Tipo de Cliente', 'Cliente', 'Solicitação', 'Telefone', 'CPF', 'CEP', 'Placa', 'Veículo', 'Renavam', 'Ano / Modelo', 'Cor', 'Serviço', 'Valor', 'Deslocamento', 'Forma de Pagamento', 'Pagamento Efetuado', 'Coluna12', 'Status', 'Fotos', 'CRLV', 'Obs.'];
const linha = (data: Date | string, unidade: string, placa: string, renavam: number | string | null, serv: string, valor: number | string, forma: string, pag: string, status: string, obs = '') =>
  ([null, data, 1, 'Empresa Cadastrada', unidade, 'Pedro ', '*', '*', '*', placa, 'FIAT/STRADA FIRE FLEX', renavam, '*', '*', serv, valor, null, forma, pag, null, status, '✅', '✅', obs] as Celula[]);
const dukar: Celula[][] = [
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 60, 23, 5],
  [null, null, null, null, null, '💰 Faturamento total:', null, null, '✅ Recebido:'],
  [], [], [null, null, null, 88, null, null, 7920], [],
  CAB,
  linha(new Date('2026-11-01T00:00:00Z'), 'Despachante Dukar SP Utinga', 'HMC5A59', 173659128, 'Laudo Baixa Permanente ', 90, 'Futuro', 'Pago', 'Vistoriado'),
  linha(new Date('2026-11-03T00:00:00Z'), 'Despachante Dukar SP Santa Barbara ', 'fvf8e48', 1049815626, 'Laudo Mera', 'R$ 90,00', 'C6 Monte PIX', 'Pendente', 'Frustrado', 'Veiculo Sem Localização Patio '),
  linha('05/11/2026', 'Despachante Dukar SP São Carlos', 'NWF5F06', null, 'Laudo Mera', 90, 'Futuro', 'Pendente', 'A Vistoriar'),
  linha(new Date('2026-11-05T00:00:00Z'), 'Despachante Dukar SP Vila Guilherme', 'MKG9I58', null, 'Laudo Mera', 90, 'Futuro', 'Pago', 'Vistoriado'),
  linha(new Date('2026-11-06T00:00:00Z'), 'Despachante Dukar SP Utinga', 'FLI7D16', null, 'Laudo Cautelar Plus', 90, 'Futuro', 'Pendente', 'A Vistoriar'),
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0], // linha da tabela sem placa
];

describe('importação · modelo novo (planilha de controle)', () => {
  it('acha o cabeçalho na linha 7 e lê unidade, data, status, pagamento e valor', () => {
    const a = analisarPlanilha(dukar, ref);
    expect(a.erroArquivo).toBeUndefined();
    expect(a.linhas.map((l) => l.linha)).toEqual([8, 9, 10, 11, 12]);
    const [l1, l2, l3, l4, l5] = a.linhas;
    expect(l1).toMatchObject({ resultado: 'ok', unidade: 'Despachante Dukar SP Utinga', patio_id: 'p-utinga', servico_id: 's-baixa', data_planilha: '2026-11-01', status_os: 'vistoriado', pagamento_status: 'pago', valor: 90, pagamento_forma: 'faturamento', nome_solicitante: 'Pedro', ano: null, cor: null, telefone: null });
    expect(l1.mensagens).toContain('Pátio pela unidade: Freitas Utinga.');
    expect(l2).toMatchObject({ resultado: 'ok', placa_normalizada: 'FVF8E48', placa_corrigida: true, patio_id: 'p-sb', status_os: 'frustrado', pagamento_status: 'pendente', valor: 90, pagamento_forma: 'pix', pagamento_forma_original: 'C6 Monte PIX', observacao: 'Veiculo Sem Localização Patio' });
    expect(l3).toMatchObject({ resultado: 'ok', patio_id: 'p-sc', data_planilha: '2026-11-05', status_os: 'a_vistoriar' });
    expect(l4).toMatchObject({ resultado: 'erro', patio_id: null });
    expect(l4.mensagens.join(' ')).toContain('Pátio não reconhecido pela unidade. Escolha o pátio.');
    expect(l5).toMatchObject({ resultado: 'erro' });
    expect(l5.mensagens.join(' ')).toContain('Serviço não reconhecido: “Laudo Cautelar Plus”');
    expect(a.contadores).toMatchObject({ total: 5, prontas: 3, comErro: 2 });
  });

  it('pátio pela unidade: nome distintivo, apelido ou cidade; ambíguo ou ausente = sem pátio', () => {
    expect(acharPatioPorUnidade('Despachante Dukar SP Utinga', ref.patios)).toBe('p-utinga');
    expect(acharPatioPorUnidade('DUKAR SANTA BÁRBARA', ref.patios)).toBe('p-sb');
    expect(acharPatioPorUnidade('Despachante Dukar SP São Carlos ', ref.patios)).toBe('p-sc');
    expect(acharPatioPorUnidade('Despachante Dukar SP Santo Andre', ref.patios)).toBe('p-utinga'); // pela cidade
    expect(acharPatioPorUnidade('Despachante Dukar SP Valinhos', ref.patios)).toBeNull();
    expect(acharPatioPorUnidade('Despachante Dukar SP Diversos {Fernanda}', ref.patios)).toBeNull();
  });

  it('lê datas, valores, status, pagamento e forma', () => {
    expect(lerData('03/11/2026')).toBe('2026-11-03'); expect(lerData('3/11/26')).toBe('2026-11-03'); expect(lerData('*')).toBeNull(); expect(lerData('ontem')).toBeUndefined();
    expect(lerValor('R$ 1.234,56')).toBe(1234.56); expect(lerValor('90')).toBe(90); expect(lerValor('')).toBeNull(); expect(lerValor('noventa')).toBeUndefined();
    expect(lerStatus('A Vistoriar')).toBe('a_vistoriar'); expect(lerStatus('VISTORIADO')).toBe('vistoriado'); expect(lerStatus('Frustrada')).toBe('frustrado'); expect(lerStatus('Cancelado')).toBe('cancelado'); expect(lerStatus('')).toBeNull(); expect(lerStatus('em análise')).toBeUndefined();
    expect(lerPagamento('Pago')).toBe('pago'); expect(lerPagamento('Pendente')).toBe('pendente'); expect(lerPagamento('Cancelado')).toBe('pendente');
    expect(lerForma('BB Santo Pix')).toBe('pix'); expect(lerForma('Cartão de Crédito')).toBe('cartao'); expect(lerForma('Dinheiro')).toBe('dinheiro'); expect(lerForma('Futuro')).toBe('faturamento'); expect(lerForma('*')).toBeNull();
  });

  it('status ou pagamento desconhecido não barra a linha: vira aviso', () => {
    const l = analisarPlanilha([CAB, linha('01/11/2026', 'Dukar Utinga', 'ABC1D23', null, 'Laudo Mera', 90, 'Futuro', 'Talvez', 'Em análise')], ref).linhas[0];
    expect(l).toMatchObject({ resultado: 'ok', status_os: null, pagamento_status: null });
    expect(l.mensagens.join(' ')).toMatch(/Status “Em análise” não reconhecido.*Pagamento “Talvez” não reconhecido/);
  });
});
