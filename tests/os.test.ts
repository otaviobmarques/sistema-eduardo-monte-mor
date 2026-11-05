import { describe, expect, it } from 'vitest';
import { mensagemErroAbertura, novaOsSchema } from '@/lib/os';

const base = {
  empresa_id: null, nome_solicitante: 'Ana', telefone: '(11) 98888-7777', placa: 'eui-6776', renavam: '639018807',
  marca_modelo: 'Fiat Uno', ano: '2015', cor: '', categoria_id: '00000000-0000-4000-8000-000000000001',
  servico_id: '00000000-0000-4000-8000-000000000002', local_tipo: 'patio' as const, patio_id: 'x',
};

describe('nova OS', () => {
  it('normaliza placa e aceita dados válidos', () => {
    const r = novaOsSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.placa).toBe('EUI6776'); expect(r.data.telefone).toBe('11988887777'); }
  });
  it('rejeita placa, renavam e telefone inválidos', () => {
    const r = novaOsSchema.safeParse({ ...base, placa: 'AB1234', renavam: '639018806', telefone: '1234' });
    expect(r.success).toBe(false);
    const campos = r.success ? [] : r.error.issues.map((i) => i.path[0]);
    expect(campos).toEqual(expect.arrayContaining(['placa', 'renavam', 'telefone']));
  });
  it('exige endereço quando fora de pátio', () => {
    const r = novaOsSchema.safeParse({ ...base, local_tipo: 'endereco', patio_id: undefined });
    expect(r.success).toBe(false);
    expect(r.success ? [] : r.error.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(['endereco', 'cidade', 'uf']));
  });
  it('traduz duplicidade com o número da OS existente', () => {
    expect(mensagemErroAbertura('DUPLICADA:123')).toEqual({ texto: 'Esta placa já tem a OS nº 123 em aberto. Acompanhe por ela.', campo: 'placa', osExistente: 123 });
  });
});
