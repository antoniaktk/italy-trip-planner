-- diagnostics-country-date.sql
-- Uruchom w Supabase SQL Editor, żeby sprawdzić kraje, daty i hotele.

select
  sort_order,
  city,
  country,
  start_date,
  end_date,
  nights,
  accommodation,
  cost,
  booking_url,
  hotel_image_url,
  status,
  created_at
from cities
order by sort_order, created_at;

-- Napraw kraj dla istniejących rekordów:
update cities
set country = 'Włochy'
where lower(city) not in ('warszawa', 'częstochowa', 'czestochowa');

update cities
set country = 'Polska'
where lower(city) in ('warszawa', 'częstochowa', 'czestochowa');

-- Wykryj odwrócone daty:
select sort_order, city, start_date, end_date
from cities
where start_date is not null
  and end_date is not null
  and end_date < start_date;

-- Napraw liczbę nocy:
update cities
set nights = greatest((end_date - start_date), 0)
where start_date is not null and end_date is not null;
