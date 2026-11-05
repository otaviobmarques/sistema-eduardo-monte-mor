/** Formas de pagamento do Asaas (billingType), sem dependências de servidor: usadas na tela e no servidor. */
export const FORMAS_ASAAS = {
  UNDEFINED: { titulo: 'O cliente escolhe', detalhe: 'Pix, boleto ou cartão de crédito, conforme o que estiver habilitado na conta Asaas.' },
  PIX: { titulo: 'Só Pix', detalhe: 'QR Code e copia e cola. Baixa em segundos após o pagamento.' },
  BOLETO: { titulo: 'Boleto', detalhe: 'O boleto do Asaas também traz QR Code Pix. Pago no código de barras, a baixa leva até 3 dias úteis.' },
  CREDIT_CARD: { titulo: 'Só cartão de crédito', detalhe: 'A Loja informa o cartão na página do Asaas; na assinatura, o cartão é cobrado todo mês.' },
} as const;
export type FormaAsaas = keyof typeof FORMAS_ASAAS;
export const formaValida = (v: unknown): FormaAsaas => (typeof v === 'string' && v in FORMAS_ASAAS ? (v as FormaAsaas) : 'UNDEFINED');
