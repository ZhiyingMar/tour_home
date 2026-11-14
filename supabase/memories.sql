-- 小星的记忆本（云端）。在 Supabase 控制台 → SQL Editor 里整段运行一次。
-- 只有登录后的本人能读写自己的行；没有“修改”权限，记录只会新增或删除。

create table if not exists public.memories (
  id         text primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  at         bigint not null,
  type       text not null,
  period     text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists memories_user_at_idx on public.memories (user_id, at desc);

alter table public.memories enable row level security;

drop policy if exists "memories_select_own" on public.memories;
drop policy if exists "memories_insert_own" on public.memories;
drop policy if exists "memories_delete_own" on public.memories;

create policy "memories_select_own" on public.memories
  for select to authenticated using (user_id = (select auth.uid()));
create policy "memories_insert_own" on public.memories
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "memories_delete_own" on public.memories
  for delete to authenticated using (user_id = (select auth.uid()));
