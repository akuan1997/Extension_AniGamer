create table if not exists public.anime1_visibility (
  user_id uuid not null references auth.users (id) on delete cascade,
  cat integer not null,
  "show" text not null check ("show" in ('hide', 'show')),
  updated_at timestamptz not null default now(),
  primary key (user_id, cat)
);

alter table public.anime1_visibility enable row level security;

grant select, insert, update on public.anime1_visibility to authenticated;

drop policy if exists "Users can read their anime1 visibility" on public.anime1_visibility;
create policy "Users can read their anime1 visibility"
on public.anime1_visibility
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their anime1 visibility" on public.anime1_visibility;
create policy "Users can insert their anime1 visibility"
on public.anime1_visibility
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their anime1 visibility" on public.anime1_visibility;
create policy "Users can update their anime1 visibility"
on public.anime1_visibility
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
