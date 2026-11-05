-- Etapa 4 · SLA: pausas, justificativa de atraso, trava de conclusão e job de alertas

-- Abre uma pausa. O relógio da OS para no primeiro pedido de pausa (pausado_desde).
create or replace function public.sla_abrir_pausa(p_os uuid, p_origem public.pausa_origem, p_ref uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.sla_pausas(os_id, origem, referencia_id, inicio) values (p_os, p_origem, p_ref, now());
  update public.ordens_servico set pausado_desde = coalesce(pausado_desde, now()) where id = p_os;
end $$;

-- Fecha a pausa ligada a p_ref. Quando não sobra nenhuma aberta, soma o tempo parado e recalcula o prazo.
create or replace function public.sla_fechar_pausa(p_os uuid, p_ref uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_desde timestamptz;
begin
  update public.sla_pausas set fim = now() where os_id = p_os and referencia_id is not distinct from p_ref and fim is null;
  if not exists (select 1 from public.sla_pausas where os_id = p_os and fim is null) then
    select pausado_desde into v_desde from public.ordens_servico where id = p_os;
    if v_desde is not null then
      update public.ordens_servico
         set total_pausado = total_pausado + (now() - v_desde),
             pausado_desde = null,
             prazo_em = aberta_em + make_interval(hours => sla_horas) + total_pausado + (now() - v_desde)
       where id = p_os;
    end if;
  end if;
end $$;

-- Funções internas: chamadas só por outras funções do banco (frustração, pendência, ajuste de preço)
revoke execute on function public.sla_abrir_pausa(uuid, public.pausa_origem, uuid) from public, anon, authenticated;
revoke execute on function public.sla_fechar_pausa(uuid, uuid) from public, anon, authenticated;

-- Justificativa de atraso (motivo padronizado + texto). Só a Loja.
create or replace function public.justificar_atraso(p_os uuid, p_motivo uuid, p_texto text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_motivo text;
begin
  if not public.is_loja() then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'TEXTO_OBRIGATORIO'; end if;
  select descricao into v_motivo from public.motivos where id = p_motivo and tipo = 'atraso' and ativo;
  if v_motivo is null then raise exception 'MOTIVO_INVALIDO'; end if;
  if not exists (select 1 from public.ordens_servico where id = p_os and status in ('a_vistoriar','frustrado')) then raise exception 'OS_ENCERRADA'; end if;
  insert into public.justificativas_atraso(os_id, motivo_id, texto, criado_por) values (p_os, p_motivo, trim(p_texto), auth.uid());
  insert into public.historico_os(os_id, evento, de, para, usuario_id, nome_exibicao)
  values (p_os, 'Atraso justificado', v_motivo, trim(p_texto), auth.uid(), public.meu_nome());
end $$;
revoke execute on function public.justificar_atraso(uuid, uuid, text) from public, anon;
grant execute on function public.justificar_atraso(uuid, uuid, text) to authenticated;

-- Trava: OS que passou do prazo só vai para Vistoriado com justificativa (seção 5.3).
create or replace function public.tg_exigir_justificativa() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'vistoriado' and old.status is distinct from 'vistoriado'
     and coalesce(new.concluida_em, now()) > new.prazo_em
     and not exists (select 1 from public.justificativas_atraso j where j.os_id = new.id) then
    raise exception 'JUSTIFICATIVA_OBRIGATORIA';
  end if;
  return new;
end $$;
revoke execute on function public.tg_exigir_justificativa() from public, anon, authenticated;
create trigger exigir_justificativa before update of status on public.ordens_servico
  for each row execute function public.tg_exigir_justificativa();

-- Job de alertas: pg_cron chama o endpoint protegido a cada 5 min via pg_net.
-- O segredo fica no Vault (nome 'cron_secret') e a URL em 'app_url'; ambos criados fora das migrations.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.disparar_job_sla() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/sla',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$;
revoke execute on function public.disparar_job_sla() from public, anon, authenticated;

select cron.schedule('alertas-sla', '*/5 * * * *', 'select public.disparar_job_sla()');
