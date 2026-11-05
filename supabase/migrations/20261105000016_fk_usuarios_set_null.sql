-- Referências "quem fez" a auth.users não podem impedir a exclusão de um usuário:
-- ao excluir, o registro fica e a referência vira nula (perfis e inscrições de push continuam em cascata).
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tabela, a.attname as coluna
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.connamespace = 'public'::regnamespace
       and c.confdeltype <> 'c'          -- mantém os ON DELETE CASCADE (perfis_usuario, push_inscricoes)
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete set null', r.tabela, r.conname, r.coluna);
  end loop;
end $$;
