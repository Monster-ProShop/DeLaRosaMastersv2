-- FIRST create/invite and verify monsterproshop@outlook.com in Authentication → Users.
-- Grant by immutable account ID, not by client-supplied metadata.
do $$
declare admin_id uuid;
begin
  select id into admin_id from auth.users
  where lower(email)='monsterproshop@outlook.com' and email_confirmed_at is not null;
  if admin_id is null then
    raise exception 'Create and verify monsterproshop@outlook.com in Supabase Authentication first.';
  end if;
  insert into public.tournament_admins(user_id) values(admin_id) on conflict(user_id) do nothing;
end $$;
