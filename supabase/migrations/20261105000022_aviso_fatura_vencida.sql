-- Aviso ao Gestor quando uma fatura da Loja vence: notificação (sino, aviso na tela e push no celular).
-- Some sozinha quando a fatura é paga ou cancelada. Faturas de teste (sandbox) não avisam.

alter table public.notificacoes add column if not exists fatura_id uuid references public.faturas(id) on delete cascade;
create index if not exists notificacoes_fatura_idx on public.notificacoes (fatura_id) where fatura_id is not null;

create or replace function public.tg_aviso_fatura() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_tol int; v_suspende date; v_valor text;
begin
  if new.ambiente is not distinct from 'sandbox' then return new; end if;
  if new.status = 'vencido' and (tg_op = 'INSERT' or old.status is distinct from 'vencido') then
    select l.dias_tolerancia into v_tol from public.lojas l where l.id = new.loja_id;
    v_suspende := new.vencimento + coalesce(v_tol, 0) + 1;
    v_valor := 'R$ ' || replace(to_char(new.valor, 'FM999999990.00'), '.', ',');
    insert into public.notificacoes (destino, loja_id, tipo, fatura_id, titulo, corpo, link)
    values ('loja', new.loja_id, 'fatura_vencida', new.id,
            'Fatura vencida · ' || v_valor,
            new.descricao || ' venceu em ' || to_char(new.vencimento, 'DD/MM/YYYY') || '. Pague até ' || to_char(v_suspende - 1, 'DD/MM/YYYY')
              || ' para evitar a suspensão do acesso da Loja e dos clientes.',
            '/loja/assinatura');
  elsif new.status in ('pago', 'cancelado') and tg_op = 'UPDATE' and old.status is distinct from new.status then
    update public.notificacoes n set vista_em = now() where n.fatura_id = new.id and n.vista_em is null;
  end if;
  return new;
end $$;
revoke all on function public.tg_aviso_fatura() from public, anon, authenticated;

drop trigger if exists aviso_fatura on public.faturas;
create trigger aviso_fatura after insert or update of status on public.faturas
  for each row execute function public.tg_aviso_fatura();
