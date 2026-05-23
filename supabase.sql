
-- Italy Trip Planner — Etap 1.1 Premium DB update
-- Run in Supabase SQL Editor.

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  eur_pln_rate numeric default 4.30,
  hero_image_url text,
  created_at timestamptz default now()
);

create table if not exists cities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  city text not null,
  start_date date,
  end_date date,
  accommodation text,
  area text,
  nights int default 0,
  cost numeric default 0,
  transport text,
  notes text,
  image_url text,
  hotel_image_url text,
  booking_url text,
  parking_cost numeric default 0,
  checkin_time text,
  checkout_time text,
  latitude numeric,
  longitude numeric,
  status text default 'plan',
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists attractions (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references cities(id) on delete cascade,
  name text not null default '',
  status text default 'want',
  price numeric default 0,
  booking_link text,
  notes text,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  label text not null default '',
  is_done boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists budget_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  label text not null default '',
  category text default 'inne',
  amount numeric default 0,
  is_paid boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table trips add column if not exists eur_pln_rate numeric default 4.30;
alter table trips add column if not exists hero_image_url text;
alter table cities add column if not exists image_url text;
alter table cities add column if not exists hotel_image_url text;
alter table cities add column if not exists booking_url text;
alter table cities add column if not exists parking_cost numeric default 0;
alter table cities add column if not exists checkin_time text;
alter table cities add column if not exists checkout_time text;
alter table cities add column if not exists latitude numeric;
alter table cities add column if not exists longitude numeric;
alter table cities add column if not exists status text default 'plan';
alter table attractions add column if not exists price numeric default 0;
alter table attractions add column if not exists booking_link text;
alter table attractions add column if not exists notes text;
alter table attractions add column if not exists status text default 'want';

alter table trips enable row level security;
alter table cities enable row level security;
alter table attractions enable row level security;
alter table checklist_items enable row level security;
alter table budget_items enable row level security;

drop policy if exists "Public read trips" on trips;
drop policy if exists "Public insert trips" on trips;
drop policy if exists "Public update trips" on trips;
drop policy if exists "Public read cities" on cities;
drop policy if exists "Public insert cities" on cities;
drop policy if exists "Public update cities" on cities;
drop policy if exists "Public delete cities" on cities;
drop policy if exists "Public read attractions" on attractions;
drop policy if exists "Public insert attractions" on attractions;
drop policy if exists "Public update attractions" on attractions;
drop policy if exists "Public delete attractions" on attractions;
drop policy if exists "Public read checklist" on checklist_items;
drop policy if exists "Public insert checklist" on checklist_items;
drop policy if exists "Public update checklist" on checklist_items;
drop policy if exists "Public delete checklist" on checklist_items;
drop policy if exists "Public read budget" on budget_items;
drop policy if exists "Public insert budget" on budget_items;
drop policy if exists "Public update budget" on budget_items;
drop policy if exists "Public delete budget" on budget_items;

create policy "Public read trips" on trips for select using (true);
create policy "Public insert trips" on trips for insert with check (true);
create policy "Public update trips" on trips for update using (true);
create policy "Public read cities" on cities for select using (true);
create policy "Public insert cities" on cities for insert with check (true);
create policy "Public update cities" on cities for update using (true);
create policy "Public delete cities" on cities for delete using (true);
create policy "Public read attractions" on attractions for select using (true);
create policy "Public insert attractions" on attractions for insert with check (true);
create policy "Public update attractions" on attractions for update using (true);
create policy "Public delete attractions" on attractions for delete using (true);
create policy "Public read checklist" on checklist_items for select using (true);
create policy "Public insert checklist" on checklist_items for insert with check (true);
create policy "Public update checklist" on checklist_items for update using (true);
create policy "Public delete checklist" on checklist_items for delete using (true);
create policy "Public read budget" on budget_items for select using (true);
create policy "Public insert budget" on budget_items for insert with check (true);
create policy "Public update budget" on budget_items for update using (true);
create policy "Public delete budget" on budget_items for delete using (true);

insert into trips (name, eur_pln_rate)
select 'Włochy 2026', 4.30
where not exists (select 1 from trips);

insert into storage.buckets (id, name, public)
values ('trip-photos', 'trip-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read trip photos" on storage.objects;
drop policy if exists "Public insert trip photos" on storage.objects;
drop policy if exists "Public update trip photos" on storage.objects;
drop policy if exists "Public delete trip photos" on storage.objects;

create policy "Public read trip photos" on storage.objects for select using (bucket_id = 'trip-photos');
create policy "Public insert trip photos" on storage.objects for insert with check (bucket_id = 'trip-photos');
create policy "Public update trip photos" on storage.objects for update using (bucket_id = 'trip-photos');
create policy "Public delete trip photos" on storage.objects for delete using (bucket_id = 'trip-photos');


-- Etap 3 smart planner tables

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references cities(id) on delete cascade,
  name text not null default '',
  cuisine text default '',
  price_level text default '',
  booking_link text,
  notes text,
  status text default 'want',
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists day_plans (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references cities(id) on delete cascade,
  plan_date date,
  time_label text default '',
  title text not null default '',
  category text default '',
  notes text,
  status text default 'plan',
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists packing_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  label text not null default '',
  category text default 'general',
  is_packed boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table restaurants enable row level security;
alter table day_plans enable row level security;
alter table packing_items enable row level security;

drop policy if exists "Public read restaurants" on restaurants;
drop policy if exists "Public insert restaurants" on restaurants;
drop policy if exists "Public update restaurants" on restaurants;
drop policy if exists "Public delete restaurants" on restaurants;

drop policy if exists "Public read day plans" on day_plans;
drop policy if exists "Public insert day plans" on day_plans;
drop policy if exists "Public update day plans" on day_plans;
drop policy if exists "Public delete day plans" on day_plans;

drop policy if exists "Public read packing" on packing_items;
drop policy if exists "Public insert packing" on packing_items;
drop policy if exists "Public update packing" on packing_items;
drop policy if exists "Public delete packing" on packing_items;

create policy "Public read restaurants" on restaurants for select using (true);
create policy "Public insert restaurants" on restaurants for insert with check (true);
create policy "Public update restaurants" on restaurants for update using (true);
create policy "Public delete restaurants" on restaurants for delete using (true);

create policy "Public read day plans" on day_plans for select using (true);
create policy "Public insert day plans" on day_plans for insert with check (true);
create policy "Public update day plans" on day_plans for update using (true);
create policy "Public delete day plans" on day_plans for delete using (true);

create policy "Public read packing" on packing_items for select using (true);
create policy "Public insert packing" on packing_items for insert with check (true);
create policy "Public update packing" on packing_items for update using (true);
create policy "Public delete packing" on packing_items for delete using (true);

insert into packing_items (trip_id, label, category, sort_order)
select (select id from trips order by created_at limit 1), 'Dokumenty / dowód / paszport', 'documents', 1
where not exists (select 1 from packing_items where label = 'Dokumenty / dowód / paszport');

insert into packing_items (trip_id, label, category, sort_order)
select (select id from trips order by created_at limit 1), 'Ubezpieczenie podróżne', 'documents', 2
where not exists (select 1 from packing_items where label = 'Ubezpieczenie podróżne');

insert into packing_items (trip_id, label, category, sort_order)
select (select id from trips order by created_at limit 1), 'Ładowarki / powerbank', 'tech', 3
where not exists (select 1 from packing_items where label = 'Ładowarki / powerbank');

insert into packing_items (trip_id, label, category, sort_order)
select (select id from trips order by created_at limit 1), 'Okulary przeciwsłoneczne', 'clothes', 4
where not exists (select 1 from packing_items where label = 'Okulary przeciwsłoneczne');

insert into packing_items (trip_id, label, category, sort_order)
select (select id from trips order by created_at limit 1), 'Krem SPF', 'health', 5
where not exists (select 1 from packing_items where label = 'Krem SPF');

insert into packing_items (trip_id, label, category, sort_order)
select (select id from trips order by created_at limit 1), 'Leki i suplementy', 'health', 6
where not exists (select 1 from packing_items where label = 'Leki i suplementy');


-- Etap 3.5 — country/date fix
alter table cities add column if not exists country text default 'Włochy';

update cities
set country = 'Włochy'
where lower(city) not in ('warszawa', 'częstochowa', 'czestochowa');

update cities
set country = 'Polska'
where lower(city) in ('warszawa', 'częstochowa', 'czestochowa');

update cities
set nights = greatest((end_date - start_date), 0)
where start_date is not null and end_date is not null;
