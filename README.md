# Italy Trip Planner — Etap 1.1 Premium

Kompletna paczka do deployu. Bez patchy, bez ręcznej edycji plików.

## Zmiany Etap 1.1
- nowy editorial hero z dużym zdjęciem
- countdown do wyjazdu
- mocniejszy luxury magazine UI
- większy timeline z kartami magazynowymi
- mocniejszy dashboard budżetu
- hotel image oddzielony od city/timeline image
- szybkie przyciski Booking + atrakcje
- statusy miast i atrakcji
- zwijane sekcje kart
- EUR → PLN
- koszty per osoba
- mapa
- drag & drop
- upload zdjęć


## Etap 2 — automatyzacje

Dodane:
- Google Maps route link dla całej trasy
- szacowany kilometraż i travel time między przystankami
- pogoda teraz przez Open-Meteo dla przystanków z koordynatami
- import bookingów przez wklejenie tekstu/mailowego potwierdzenia
- rekomendacje miejsc w stylu AI-ready, zależne od miasta
- utrzymany live kurs NBP i countdown

Uwaga:
- pogoda dla wyjazdu w 2026 nie może być realną prognozą długoterminową; moduł pokazuje pogodę aktualną i będzie praktyczny bliżej terminu.
- travel time jest szacunkowy; przycisk Google Maps otwiera prawdziwą trasę.


## Etap 3 — smart planner

Dodane:
- Smart alerts: braki w noclegach, bookingach, cenach, hotel image, koordynatach i atrakcjach.
- Packing list zapisywany online w Supabase.
- Plan dnia / mini itinerary per miasto.
- Smart generate planu dnia na bazie miasta.
- Restauracje per miasto.
- Smart foodie suggestions dla miast.
- Utrzymany Etap 2: Google Maps, travel time, pogoda, import bookingów, countdown, live kurs.

To nadal działa bez backendu AI/API. Rekomendacje są AI-ready i przygotowane jako lokalna warstwa smart logic.


## Etap 3.1 — fix planu dnia

Poprawione:
- Smart regenerate nie tworzy już duplikatów.
- Przy generowaniu planu dnia najpierw usuwa istniejący plan dla danego miasta, potem tworzy świeży.
- Układ wierszy planu dnia jest bardziej kompaktowy.


## Etap 3.2 — numeric fix

Poprawione:
- puste pola liczbowe nie wysyłają już `""` do Supabase,
- `cost`, `parking_cost`, `latitude`, `longitude`, `price`, `amount` są automatycznie czyszczone do liczby,
- puste daty są zapisywane jako `null`,
- usuwa błąd: `invalid input syntax for type numeric: ""`.


## Etap 3.3 FIXED — hero image

Dodane poprawnie:
- pole `hero_image_url` w tabeli `trips`,
- widoczna sekcja `Hero image / Obraz główny`,
- podgląd obrazu hero,
- zmiana przez URL,
- upload do Supabase Storage,
- hero używa `trip.hero_image_url`, a dopiero potem fallback do zdjęcia pierwszego miasta.


## Etap 3.4 — safe save only

Ta paczka NIE zmienia layoutu ani CSS.

Zmienione tylko:
- `updateCity()` zapisuje do Supabase wyłącznie jedno zmienione pole,
- zmiana nazwy miasta nie nadpisuje już hotelu, bookingu, ceny, zdjęć itd.,
- zmiana dat nadal aktualizuje liczbę nocy.

Dodane:
- `diagnostics.sql` do sprawdzenia danych w Supabase.


## Etap 3.5 — country/date fix

Poprawione:
- nowe miasto domyślnie dostaje kraj `Włochy`,
- Warszawa i Częstochowa pozostają `Polska`,
- przy zmianie nazwy miasta kraj aktualizuje się automatycznie,
- dodane pole `Kraj` do ręcznej korekty,
- zabezpieczenie dat: jeśli data końca jest wcześniejsza niż start, aplikacja wyrównuje koniec do startu i daje 0 nocy,
- SQL migruje istniejące rekordy.

Dodane:
- `diagnostics-country-date.sql`.
