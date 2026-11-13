-- Run once in the Supabase SQL Editor, AFTER creating your Supabase project.
-- The browser uses the public publishable/anon key. RLS protects the records.

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  content text not null check (char_length(btrim(content)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prompts_user_updated_idx
  on public.prompts (user_id, updated_at desc);

-- Update timestamp is assigned by Postgres, not trusted to client input.
create or replace function public.touch_prompt_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists prompts_touch_updated_at on public.prompts;
create trigger prompts_touch_updated_at
before update on public.prompts
for each row execute function public.touch_prompt_updated_at();

alter table public.prompts enable row level security;

-- Anonymous visitors do not get SQL permission to view or modify prompt rows.
revoke all on table public.prompts from anon, authenticated;
grant select, insert, update, delete on table public.prompts to authenticated;

drop policy if exists "prompt_select_own" on public.prompts;
create policy "prompt_select_own" on public.prompts
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "prompt_insert_own" on public.prompts;
create policy "prompt_insert_own" on public.prompts
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "prompt_update_own" on public.prompts;
create policy "prompt_update_own" on public.prompts
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "prompt_delete_own" on public.prompts;
create policy "prompt_delete_own" on public.prompts
for delete to authenticated
using ((select auth.uid()) = user_id);
