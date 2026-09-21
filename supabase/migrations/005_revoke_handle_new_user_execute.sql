-- Phase 5 security follow-up.
--
-- Supabase's security advisor flagged public.handle_new_user() as a
-- SECURITY DEFINER function callable by anon and authenticated. It is the auth
-- signup trigger function created in 003_forge_profiles_trigger.sql, and it has
-- no reason to be reachable from the Data API as an RPC endpoint.
--
-- Why this is safe for signup, in Postgres's own terms:
--   * EXECUTE privilege on a trigger function is checked when the trigger is
--     created, not when it fires, so revoking it does not stop
--     on_auth_user_created from running.
--   * The function is SECURITY DEFINER, so it keeps running with its owner's
--     privileges; the owner is unaffected by a REVOKE ... FROM PUBLIC.
--   * Nothing in the application calls this function over RPC.
--
-- The function body and its behaviour are untouched: there is no CREATE OR
-- REPLACE and no ALTER FUNCTION here, only privilege revocation. REVOKE is
-- idempotent, and the guard makes the migration a no-op on a database where the
-- function does not exist yet.

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'handle_new_user'
  ) then
    revoke execute on function public.handle_new_user() from public;
    revoke execute on function public.handle_new_user() from anon;
    revoke execute on function public.handle_new_user() from authenticated;
  end if;
end $$;

-- Postgres and service_role are deliberately left alone: the trigger fires as
-- the function owner, and the server-side service role is the trusted path that
-- already holds broader privileges.
