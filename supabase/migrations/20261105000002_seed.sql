-- Dados iniciais (seção 11 do briefing)
insert into public.configuracoes (id) values (1) on conflict do nothing;

insert into public.categorias_veiculo (nome, ordem) values
  ('Carro',1),('Moto',2),('Utilitário',3),('Caminhão',4),('Outro',5)
on conflict do nothing;

insert into public.servicos (nome, sla_horas, padrao) values ('Vistoria cautelar', 48, true)
on conflict do nothing;

-- Preços a definir: zerados, editáveis em Cadastros › Serviços e preços
insert into public.precos (servico_id, categoria_id, valor)
select s.id, c.id, 0 from public.servicos s cross join public.categorias_veiculo c
on conflict do nothing;

-- Pátios: endereço e cidade a confirmar com o franqueado (valores provisórios)
insert into public.patios (nome, cidade, uf) values
  ('Freitas Utinga', 'Santo André', 'SP'),
  ('Freitas Santa Bárbara', 'Santa Bárbara d''Oeste', 'SP'),
  ('Leilo São Carlos', 'São Carlos', 'SP'),
  ('Leilomaster SP', 'São Paulo', 'SP')
on conflict do nothing;

insert into public.patio_apelidos (patio_id, apelido)
select p.id, a.apelido from public.patios p
join (values
  ('Freitas Utinga','Utinga'),
  ('Freitas Utinga','Freitas - Utinga'),
  ('Freitas Santa Bárbara','Freitas S. Barbara'),
  ('Freitas Santa Bárbara','Freitas Sta Barbara'),
  ('Freitas Santa Bárbara','Santa Barbara'),
  ('Leilo São Carlos','Leilo Sao Carlos'),
  ('Leilo São Carlos','São Carlos'),
  ('Leilomaster SP','Leilomaster'),
  ('Leilomaster SP','Leilo Master')
) as a(patio, apelido) on a.patio = p.nome
on conflict do nothing;

insert into public.motivos (tipo, descricao, ordem) values
  ('frustracao','Veículo não localizado no pátio',1),
  ('frustracao','Falta de autorização do pátio',2),
  ('frustracao','Pendência documental',3),
  ('frustracao','Problema de agendamento',4),
  ('frustracao','Outro',99),
  ('cancelamento','Solicitado pelo cliente',1),
  ('cancelamento','Veículo vendido ou retirado',2),
  ('cancelamento','Duplicidade',3),
  ('cancelamento','Outro',99),
  ('atraso','Falta de vistoriador na região',1),
  ('atraso','Pátio sem acesso',2),
  ('atraso','Demora na autorização',3),
  ('atraso','Problema no sistema',4),
  ('atraso','Outro',99),
  ('reagendamento','Solicitado pelo cliente',1),
  ('reagendamento','Indisponibilidade do vistoriador',2),
  ('reagendamento','Pátio sem acesso',3),
  ('reagendamento','Outro',99),
  ('pendencia','Documentação',1),
  ('pendencia','Autorização',2),
  ('pendencia','Outro',99)
on conflict do nothing;
