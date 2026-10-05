create table if not exists public.anime1_visibility (
  user_id uuid not null references auth.users (id) on delete cascade,
  cat integer not null,
  "show" text not null default 'show' check ("show" in ('hide', 'show', 'follow')),
  "count" integer not null default 0 check ("count" >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, cat)
);

alter table public.anime1_visibility
add column if not exists "count" integer not null default 0 check ("count" >= 0);

alter table public.anime1_visibility
alter column "show" set default 'show';

alter table public.anime1_visibility
drop constraint if exists anime1_visibility_show_check;

alter table public.anime1_visibility
add constraint anime1_visibility_show_check check ("show" in ('hide', 'show', 'follow'));

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

create table if not exists public.jable_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  preference_type text not null check (preference_type in ('keyword', 'video')),
  preference_key text not null,
  label text not null default '',
  category text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, preference_type, preference_key),
  constraint jable_preferences_category_check check (
    category in ('god', 'like', 'observe', 'fake_boobs', 'hard_to_use', 'watched')
  ),
  constraint jable_preferences_expiry_check check (
    (
      preference_type = 'keyword'
      and category in ('god', 'like', 'observe', 'fake_boobs', 'hard_to_use')
      and expires_at is null
    )
    or (
      preference_type = 'video'
      and category = 'watched'
      and expires_at is not null
    )
  )
);

-- One-time migration from the old numeric level format and the removed
-- "face" category. Supported category rows survive future reruns.
alter table public.jable_preferences
add column if not exists category text;

delete from public.jable_preferences
where category is null or category = 'face';

alter table public.jable_preferences
drop column if exists level;

alter table public.jable_preferences
alter column category set not null;

alter table public.jable_preferences
drop constraint if exists jable_preferences_category_check;

alter table public.jable_preferences
add constraint jable_preferences_category_check check (
  category in ('god', 'like', 'observe', 'fake_boobs', 'hard_to_use', 'watched')
);

alter table public.jable_preferences
drop constraint if exists jable_preferences_expiry_check;

alter table public.jable_preferences
add constraint jable_preferences_expiry_check check (
  (
    preference_type = 'keyword'
    and category in ('god', 'like', 'observe', 'fake_boobs', 'hard_to_use')
    and expires_at is null
  )
  or (
    preference_type = 'video'
    and category = 'watched'
    and expires_at is not null
  )
);

create index if not exists jable_preferences_expires_at_idx
on public.jable_preferences (expires_at)
where preference_type = 'video';

alter table public.jable_preferences enable row level security;

grant select, insert, update, delete on public.jable_preferences to authenticated;

drop policy if exists "Users can read their Jable preferences" on public.jable_preferences;
create policy "Users can read their Jable preferences"
on public.jable_preferences
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their Jable preferences" on public.jable_preferences;
create policy "Users can insert their Jable preferences"
on public.jable_preferences
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their Jable preferences" on public.jable_preferences;
create policy "Users can update their Jable preferences"
on public.jable_preferences
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their Jable preferences" on public.jable_preferences;
create policy "Users can delete their Jable preferences"
on public.jable_preferences
for delete
using (auth.uid() = user_id);
