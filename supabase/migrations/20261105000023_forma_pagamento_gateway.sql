-- Forma de pagamento das cobranças do gateway (Asaas billingType): o cliente escolhe, só Pix, boleto ou só cartão.
alter table public.gateways_pagamento
  add column if not exists forma_pagamento text not null default 'UNDEFINED'
  check (forma_pagamento in ('UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD'));
comment on column public.gateways_pagamento.forma_pagamento is 'Forma padrão das cobranças novas: UNDEFINED = o cliente escolhe (Pix, boleto ou cartão)';

-- Forma pedida em cada fatura do gateway (a forma efetivamente usada fica em forma_pagamento, vinda do webhook)
alter table public.faturas add column if not exists forma_solicitada text
  check (forma_solicitada in ('UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD'));
