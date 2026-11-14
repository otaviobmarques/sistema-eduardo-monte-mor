-- Confirmação de leitura das novas vistorias (decidido em 14/11/2026): na Loja, cada OS/lote que chega no dia aparece num
-- pop-up com caixa “Li e estou ciente”. A confirmação grava quem e quando (independe de abrir a notificação no sino) e entra
-- na linha do tempo da OS.
alter table public.notificacoes add column if not exists leitura_confirmada_em timestamptz;
alter table public.notificacoes add column if not exists leitura_confirmada_por uuid references auth.users(id) on delete set null;

create or replace function public.confirmar_leitura(p_ids uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare v_loja uuid := public.minha_loja(); n int := 0; r record;
begin
  if v_loja is null or not public.is_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  for r in
    update public.notificacoes nt
       set leitura_confirmada_em = now(), leitura_confirmada_por = auth.uid(), vista_em = coalesce(nt.vista_em, now()),
           vista_por = coalesce(nt.vista_por, auth.uid())
     where nt.id = any(p_ids) and nt.loja_id = v_loja and nt.destino = 'loja' and nt.leitura_confirmada_em is null
     returning nt.os_id, nt.lote_id, nt.tipo
  loop
    n := n + 1;
    if r.os_id is not null then
      insert into public.historico_os(os_id, evento, de, para, usuario_id, nome_exibicao)
      values (r.os_id, 'Leitura confirmada', null, 'Nova OS', auth.uid(), public.meu_nome());
    elsif r.lote_id is not null then
      insert into public.historico_os(os_id, evento, de, para, usuario_id, nome_exibicao)
      select o.id, 'Leitura confirmada', null, 'Novo lote', auth.uid(), public.meu_nome()
        from public.ordens_servico o where o.lote_id = r.lote_id and o.loja_id = v_loja;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.confirmar_leitura(uuid[]) from public, anon;
grant execute on function public.confirmar_leitura(uuid[]) to authenticated;

-- Quem gerou a notificação (auth.uid() de quem abriu a OS/confirmou o lote): o pop-up não pede confirmação de quem abriu a própria OS
alter table public.notificacoes add column if not exists criada_por uuid default auth.uid();
