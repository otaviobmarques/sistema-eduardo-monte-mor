-- Etapa 7 · Web Push: cada notificação inserida (por função SQL ou pelo app) dispara o envio via /api/push/enviar.
create or replace function public.tg_notificacao_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/push/enviar',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := jsonb_build_object('id', new.id),
    timeout_milliseconds := 15000);
  return new;
exception when others then
  return new; -- push nunca pode impedir a notificação
end $$;
revoke execute on function public.tg_notificacao_push() from public, anon, authenticated;
create trigger enviar_push after insert on public.notificacoes for each row execute function public.tg_notificacao_push();

-- Consulta rápida das não lidas por destino
create index if not exists notificacoes_nao_lidas on public.notificacoes (loja_id, destino, criada_em desc) where vista_em is null;
