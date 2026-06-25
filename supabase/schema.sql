create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  shift text not null check (shift in ('first', 'second')),
  start_time time not null,
  end_time time not null,
  status text not null default 'available' check (status in ('available', 'pending', 'booked', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, shift)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.slots(id) on delete cascade,
  date date not null,
  shift text not null check (shift in ('first', 'second')),
  client_name text,
  client_phone text,
  status text not null default 'pending' check (status in ('available', 'pending', 'booked', 'cancelled')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists slots_date_idx on public.slots (date);
create index if not exists slots_status_idx on public.slots (status);
create index if not exists bookings_slot_id_idx on public.bookings (slot_id);
create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_created_at_idx on public.bookings (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_slots_updated_at on public.slots;
create trigger set_slots_updated_at
before update on public.slots
for each row execute function public.set_updated_at();

drop trigger if exists set_bookings_updated_at on public.bookings;
create trigger set_bookings_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

create or replace function public.create_pending_booking(
  target_slot_id uuid,
  client_name text default null,
  client_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_slot public.slots%rowtype;
  new_booking_id uuid;
begin
  select *
  into selected_slot
  from public.slots
  where id = target_slot_id
  for update;

  if not found then
    raise exception 'slot_not_found';
  end if;

  if selected_slot.status in ('booked', 'cancelled') then
    raise exception 'slot_unavailable';
  end if;

  insert into public.bookings (slot_id, date, shift, client_name, client_phone, status)
  values (
    selected_slot.id,
    selected_slot.date,
    selected_slot.shift,
    nullif(trim(client_name), ''),
    nullif(trim(client_phone), ''),
    'pending'
  )
  returning id into new_booking_id;

  update public.slots
  set status = 'pending'
  where id = selected_slot.id
    and status = 'available';

  return new_booking_id;
end;
$$;

create or replace function public.confirm_booking(target_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_slot_id uuid;
  target_status text;
begin
  if not public.is_admin() then
    raise exception 'not_allowed';
  end if;

  select slot_id, status
  into target_slot_id, target_status
  from public.bookings
  where id = target_booking_id
  for update;

  if not found then
    raise exception 'booking_not_found';
  end if;

  if target_status not in ('pending', 'booked') then
    raise exception 'booking_not_confirmable';
  end if;

  if exists (
    select 1
    from public.bookings
    where slot_id = target_slot_id
      and id <> target_booking_id
      and status = 'booked'
  ) then
    raise exception 'slot_already_booked';
  end if;

  update public.bookings
  set status = 'cancelled'
  where slot_id = target_slot_id
    and id <> target_booking_id
    and status = 'pending';

  update public.bookings
  set status = 'booked'
  where id = target_booking_id;

  update public.slots
  set status = 'booked'
  where id = target_slot_id;
end;
$$;

create or replace function public.cancel_booking(target_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_slot_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not_allowed';
  end if;

  select slot_id
  into target_slot_id
  from public.bookings
  where id = target_booking_id
  for update;

  if not found then
    raise exception 'booking_not_found';
  end if;

  update public.bookings
  set status = 'cancelled'
  where id = target_booking_id;

  if exists (
    select 1 from public.bookings
    where slot_id = target_slot_id
      and status = 'booked'
  ) then
    update public.slots
    set status = 'booked'
    where id = target_slot_id;
  elsif exists (
    select 1 from public.bookings
    where slot_id = target_slot_id
      and status = 'pending'
  ) then
    update public.slots
    set status = 'pending'
    where id = target_slot_id;
  else
    update public.slots
    set status = 'available'
    where id = target_slot_id;
  end if;
end;
$$;

create or replace function public.release_slot(target_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed';
  end if;

  update public.bookings
  set status = 'cancelled'
  where slot_id = target_slot_id
    and status in ('pending', 'booked');

  update public.slots
  set status = 'available'
  where id = target_slot_id;
end;
$$;

alter table public.admin_users enable row level security;
alter table public.slots enable row level security;
alter table public.bookings enable row level security;

drop policy if exists "Admins can read admin users" on public.admin_users;
create policy "Admins can read admin users"
on public.admin_users
for select
to authenticated
using (public.is_admin());

drop policy if exists "Public can read slots" on public.slots;
create policy "Public can read slots"
on public.slots
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can insert slots" on public.slots;
create policy "Admins can insert slots"
on public.slots
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update slots" on public.slots;
create policy "Admins can update slots"
on public.slots
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete slots" on public.slots;
create policy "Admins can delete slots"
on public.slots
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Admins can read bookings" on public.bookings;
create policy "Admins can read bookings"
on public.bookings
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update bookings" on public.bookings;
create policy "Admins can update bookings"
on public.bookings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete bookings" on public.bookings;
create policy "Admins can delete bookings"
on public.bookings
for delete
to authenticated
using (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.slots to anon, authenticated;
grant select, insert, update, delete on public.slots to authenticated;
grant select, update, delete on public.bookings to authenticated;
grant execute on function public.create_pending_booking(uuid, text, text) to anon, authenticated;
grant execute on function public.confirm_booking(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.release_slot(uuid) to authenticated;

-- After creating the admin user in Supabase Auth, add that user's UUID:
-- insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-000000000000');
