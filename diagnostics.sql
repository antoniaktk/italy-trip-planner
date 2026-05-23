-- diagnostics.sql
-- Uruchom w Supabase SQL Editor, żeby sprawdzić dane przystanków i hoteli.

select
  sort_order,
  city,
  start_date,
  end_date,
  nights,
  accommodation,
  cost,
  booking_url,
  hotel_image_url,
  image_url,
  status,
  created_at
from cities
order by sort_order, created_at;

select
  sort_order,
  city,
  nights,
  accommodation,
  cost,
  booking_url,
  hotel_image_url
from cities
where
  coalesce(nights, 0) > 0
  and (
    nullif(accommodation, '') is null
    or nullif(booking_url, '') is null
    or coalesce(cost, 0) = 0
    or nullif(hotel_image_url, '') is null
  )
order by sort_order;

select count(*) as liczba_przystankow from cities;
