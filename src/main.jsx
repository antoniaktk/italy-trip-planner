import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase, supabaseConfigured } from "./supabaseClient";
import "./styles.css";

const PEOPLE = 2;
const defaultTripName = "Włochy 2026";
const statuses = ["plan", "booked", "paid", "done"];

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

function eur(v) { return `${(Number(v) || 0).toFixed(2)} €`; }
function pln(v, r) { return `${((Number(v) || 0) * (Number(r) || 0)).toFixed(2)} zł`; }

const numericCityFields = new Set(["cost", "parking_cost", "latitude", "longitude", "nights", "sort_order"]);
const numericAttractionFields = new Set(["price", "sort_order"]);
const numericBudgetFields = new Set(["amount", "sort_order"]);

function cleanNumberInput(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanDateInput(value) {
  return value === "" ? null : value;
}

function inferCountry(cityName = "") {
  const n = String(cityName || "").toLowerCase().trim();
  if (["warszawa", "częstochowa", "czestochowa"].includes(n)) return "Polska";
  return "Włochy";
}

function normalizeCityPatch(field, value, currentCity = {}) {
  const cleanedValue = numericCityFields.has(field)
    ? cleanNumberInput(value, 0)
    : (field === "start_date" || field === "end_date")
      ? cleanDateInput(value)
      : value;

  const patch = { [field]: cleanedValue };

  if (field === "city") {
    patch.country = inferCountry(cleanedValue);
  }

  if (field === "start_date" || field === "end_date") {
    const nextStart = field === "start_date" ? cleanedValue : currentCity.start_date;
    const nextEnd = field === "end_date" ? cleanedValue : currentCity.end_date;

    if (nextStart && nextEnd && new Date(`${nextEnd}T00:00:00`) < new Date(`${nextStart}T00:00:00`)) {
      patch.end_date = nextStart;
      patch.nights = 0;
    } else {
      patch.nights = nights(nextStart, nextEnd);
    }
  }

  return patch;
}


function daysToTrip(cities) {
  const first = cities.find((c) => c.start_date)?.start_date;
  if (!first) return null;
  const today = new Date();
  const start = new Date(`${first}T00:00:00`);
  const diff = Math.ceil((start - today) / 86400000);
  return diff;
}

function nights(a, b) {
  if (!a || !b) return 0;
  const d = Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);
  return d > 0 ? d : 0;
}
function dateRange(a, b) {
  const f = (x) => x ? `${x.split("-")[2]}.${x.split("-")[1]}` : "";
  if (a && b) return a === b ? f(a) : `${f(a)} → ${f(b)}`;
  return f(a || b);
}
function fullDate(a) {
  if (!a) return "Data do uzupełnienia";
  const [year, month, day] = a.split("-");
  return `${day}.${month}.${year}`;
}

function makeGoogleMapsRouteUrl(cities) {
  const stops = cities
    .filter(c => c.city)
    .map(c => encodeURIComponent(c.city))
    .join("/");
  return stops ? `https://www.google.com/maps/dir/${stops}` : "https://www.google.com/maps";
}

function haversineKm(a, b) {
  if (!a || !b || !a.latitude || !a.longitude || !b.latitude || !b.longitude) return 0;
  const R = 6371;
  const dLat = (Number(b.latitude) - Number(a.latitude)) * Math.PI / 180;
  const dLon = (Number(b.longitude) - Number(a.longitude)) * Math.PI / 180;
  const lat1 = Number(a.latitude) * Math.PI / 180;
  const lat2 = Number(b.latitude) * Math.PI / 180;
  const x = Math.sin(dLat/2) ** 2 + Math.sin(dLon/2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x)));
}

function estimateDriveHours(km) {
  if (!km) return 0;
  return Math.max(1, Math.round((km / 72) * 10) / 10);
}

function cityRecommendation(city = "") {
  const name = city.toLowerCase();
  if (name.includes("positano")) return ["Spacer Spiaggia Grande o zachodzie", "Rezerwacja kolacji z widokiem", "Prom / boat day po Amalfi Coast"];
  if (name.includes("ravello")) return ["Villa Cimbrone i taras widokowy", "Villa Rufolo rano", "Kolacja spokojniej niż w Positano"];
  if (name.includes("vico")) return ["Baza pod Sorrento", "Pompeje z rana", "Neapol na pizzę i spacer"];
  if (name.includes("udine")) return ["Nocleg tranzytowy", "Krótki spacer po centrum", "Tankowanie i spokojny wyjazd rano"];
  if (name.includes("częstochowa")) return ["Krótki postój", "Kawa / przerwa w trasie", "Jasna Góra tylko jeśli pasuje czasowo"];
  if (name.includes("warszawa")) return ["Check dokumentów", "Pakowanie", "Start / powrót"];
  return ["Sprawdź lokalne jedzenie", "Dodaj 2–3 miejsca must-see", "Zapisz parking i logistykę"];
}

function smartRestaurants(city = "") {
  const name = city.toLowerCase();
  if (name.includes("positano")) return ["La Sponda / kolacja premium", "Chez Black / klasyk przy plaży", "Casa e Bottega / lunch"];
  if (name.includes("ravello")) return ["Rossellinis / fine dining", "Cumpa Cosimo / lokalnie", "Villa Maria / widok"];
  if (name.includes("vico")) return ["Pizza a Metro", "Torre del Saracino", "Sorrento dinner option"];
  if (name.includes("neapol")) return ["Da Michele", "Sorbillo", "Gran Caffè Gambrinus"];
  return ["Dodaj restaurację lokalną", "Sprawdź widok / rezerwację", "Zapisz parking lub dojście"];
}

function smartDaySkeleton(city = "", startDate = "") {
  const recs = cityRecommendation(city);
  return [
    { time_label: "09:30", title: recs[0] || "Poranny spacer", category: "morning", plan_date: startDate || null },
    { time_label: "13:00", title: "Lunch / odpoczynek", category: "food", plan_date: startDate || null },
    { time_label: "17:30", title: recs[1] || "Atrakcja popołudniowa", category: "afternoon", plan_date: startDate || null },
    { time_label: "20:00", title: recs[2] || "Kolacja", category: "evening", plan_date: startDate || null }
  ];
}

function missingAlerts(city, attractionsForCity = []) {
  const alerts = [];
  if (!city.accommodation && Number(city.nights || 0) > 0) alerts.push("brak noclegu");
  if (!city.booking_url && Number(city.nights || 0) > 0) alerts.push("brak linku Booking");
  if (!city.cost && Number(city.nights || 0) > 0) alerts.push("brak ceny noclegu");
  if (!city.hotel_image_url && Number(city.nights || 0) > 0) alerts.push("brak zdjęcia hotelu");
  if (!city.latitude || !city.longitude) alerts.push("brak koordynatów");
  if (!attractionsForCity.length && Number(city.nights || 0) > 0) alerts.push("brak atrakcji");
  return alerts;
}

function parseBookingText(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const result = {};
  const joined = lines.join(" ");
  const url = joined.match(/https?:\/\/\S+/)?.[0] || "";
  const price = joined.match(/(?:€|EUR)\s*([0-9]+(?:[.,][0-9]+)?)/i)?.[1] || joined.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:€|EUR)/i)?.[1] || "";
  const dates = joined.match(/(20\d{2}-\d{2}-\d{2}).*?(20\d{2}-\d{2}-\d{2})/);
  if (url) result.booking_url = url;
  if (price) result.cost = price.replace(",", ".");
  if (dates) {
    result.start_date = dates[1];
    result.end_date = dates[2];
  }
  const hotelLine = lines.find(l => !l.includes("http") && !l.match(/20\d{2}-\d{2}-\d{2}/) && l.length > 3);
  if (hotelLine) result.accommodation = hotelLine;
  return result;
}
function fallbackImage(name = "") {
  const n = name.toLowerCase();
  if (n.includes("warszawa")) return "https://images.unsplash.com/photo-1519197924294-4ba991a11128?auto=format&fit=crop&w=1600&q=85";
  if (n.includes("positano")) return "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1600&q=85";
  if (n.includes("ravello")) return "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?auto=format&fit=crop&w=1600&q=85";
  if (n.includes("vico")) return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=85";
  return "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1600&q=85";
}
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
  }, [map, points]);
  return null;
}

function App() {
  const [trip, setTrip] = useState(null);
  const [cities, setCities] = useState([]);
  const [attractions, setAttractions] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [budget, setBudget] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [dayPlans, setDayPlans] = useState([]);
  const [packing, setPacking] = useState([]);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [rate, setRate] = useState(4.3);
  const [weather, setWeather] = useState({});
  const [bookingImport, setBookingImport] = useState("");

  const timeline = useMemo(() => cities.map((c, i) => ({
    ...c,
    date: dateRange(c.start_date, c.end_date),
    emoji: i === 0 ? "🏁" : i === cities.length - 1 ? "🏠" : "📍",
    photo: c.image_url || fallbackImage(c.city)
  })), [cities]);

  const mapPoints = timeline.filter(c => Number(c.latitude) && Number(c.longitude)).map(c => [Number(c.latitude), Number(c.longitude)]);
  const countdown = daysToTrip(cities);
  const firstCity = cities[0];
  const lastCity = cities[cities.length - 1];
  const googleMapsRouteUrl = makeGoogleMapsRouteUrl(cities);
  const routeSegments = cities.slice(0, -1).map((city, index) => {
    const next = cities[index + 1];
    const km = haversineKm(city, next);
    return { from: city.city, to: next.city, km, hours: estimateDriveHours(km) };
  });
  const totalKm = routeSegments.reduce((sum, seg) => sum + seg.km, 0);
  const totalDriveHours = routeSegments.reduce((sum, seg) => sum + seg.hours, 0);

  const totals = useMemo(() => {
    const hotels = cities.reduce((s, c) => s + Number(c.cost || 0), 0);
    const parking = cities.reduce((s, c) => s + Number(c.parking_cost || 0), 0);
    const attr = attractions.reduce((s, a) => s + Number(a.price || 0), 0);
    const other = budget.reduce((s, b) => s + Number(b.amount || 0), 0);
    return { hotels, parking, attr, other, total: hotels + parking + attr + other, nights: cities.reduce((s, c) => s + Number(c.nights || 0), 0) };
  }, [cities, attractions, budget]);

  const visibleCities = cities.filter(c => `${c.city} ${c.area || ""} ${c.accommodation || ""} ${c.notes || ""}`.toLowerCase().includes(filter.toLowerCase()));

  useEffect(() => { if (supabaseConfigured) load(); else setLoading(false); }, []);

  useEffect(() => {
    if (!cities.length) return;
    loadWeather();
  }, [cities.map(c => `${c.id}-${c.latitude}-${c.longitude}`).join("|")]);

  async function loadWeather() {
    const entries = {};
    await Promise.all(cities.map(async (city) => {
      if (!city.latitude || !city.longitude) return;
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
        const res = await fetch(url);
        const json = await res.json();
        entries[city.id] = {
          temp: json?.current?.temperature_2m,
          wind: json?.current?.wind_speed_10m,
          code: json?.current?.weather_code
        };
      } catch {
        entries[city.id] = null;
      }
    }));
    setWeather(entries);
  }

  async function load() {
    setLoading(true);
    let { data: trips, error } = await supabase.from("trips").select("*").order("created_at").limit(1);
    if (error) return fail(error);
    let t = trips?.[0];
    if (!t) {
      const r = await supabase.from("trips").insert({ name: defaultTripName, eur_pln_rate: 4.3 }).select().single();
      if (r.error) return fail(r.error);
      t = r.data;
    }
    setTrip(t);
    setRate(Number(t.eur_pln_rate) || 4.3);
    await refresh(t.id);
    setStatus("Zapis online działa");
    setLoading(false);
  }

  async function refresh(tripId = trip?.id) {
    if (!tripId) return;
    const [c, a, ch, b, r, d, p] = await Promise.all([
      supabase.from("cities").select("*").eq("trip_id", tripId).order("sort_order"),
      supabase.from("attractions").select("*").order("sort_order"),
      supabase.from("checklist_items").select("*").eq("trip_id", tripId).order("sort_order"),
      supabase.from("budget_items").select("*").eq("trip_id", tripId).order("sort_order"),
      supabase.from("restaurants").select("*").order("sort_order"),
      supabase.from("day_plans").select("*").order("plan_date").order("sort_order"),
      supabase.from("packing_items").select("*").eq("trip_id", tripId).order("sort_order")
    ]);
    if (c.error) return fail(c.error);
    if (a.error) return fail(a.error);
    if (ch.error) return fail(ch.error);
    if (b.error) return fail(b.error);
    if (r.error) return fail(r.error);
    if (d.error) return fail(d.error);
    if (p.error) return fail(p.error);
    setCities(c.data || []);
    setAttractions(a.data || []);
    setChecklist(ch.data || []);
    setBudget(b.data || []);
    setRestaurants(r.data || []);
    setDayPlans(d.data || []);
    setPacking(p.data || []);
  }

  function fail(e) { console.error(e); setStatus(`Błąd: ${e.message}`); setLoading(false); }

  async function updateTrip(field, value) {
    setTrip({ ...trip, [field]: value });
    await supabase.from("trips").update({ [field]: value }).eq("id", trip.id);
  }
  async function fetchRate() {
    try {
      const res = await fetch("https://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json");
      const json = await res.json();
      const r = json.rates[0].mid;
      setRate(r);
      await updateTrip("eur_pln_rate", r);
      setStatus(`Kurs NBP: ${r}`);
    } catch { setStatus("Nie udało się pobrać kursu NBP"); }
  }
  async function updateCity(id, field, value) {
    const currentCity = cities.find(c => c.id === id) || {};
    const patch = normalizeCityPatch(field, value, currentCity);

    const next = cities.map(c => {
      if (c.id !== id) return c;
      return { ...c, ...patch };
    });

    setCities(next);

    const { error } = await supabase
      .from("cities")
      .update(patch)
      .eq("id", id);

    if (error) {
      fail(error);
      await refresh(trip?.id);
      return;
    }

    setStatus("Zapisano");
  }
  async function addCity() {
    const { data, error } = await supabase.from("cities").insert({ trip_id: trip.id, city: "Nowe miasto", country: "Włochy", sort_order: cities.length + 1, cost: 0, parking_cost: 0, status: "plan" }).select().single();
    if (error) return fail(error);
    setCities([...cities, data]);
  }
  async function removeCity(id) {
    setCities(cities.filter(c => c.id !== id));
    setAttractions(attractions.filter(a => a.city_id !== id));
    const { error } = await supabase.from("cities").delete().eq("id", id);
    if (error) fail(error);
  }
  async function uploadPhoto(cityId, file, field) {
    if (!file) return;
    const path = `${cityId}-${field}-${Date.now()}-${file.name}`;
    const up = await supabase.storage.from("trip-photos").upload(path, file, { upsert: true });
    if (up.error) return fail(up.error);
    const { data } = supabase.storage.from("trip-photos").getPublicUrl(path);
    await updateCity(cityId, field, data.publicUrl);
  }

  async function uploadHeroPhoto(file) {
    if (!file || !trip?.id) return;
    const path = `hero-${trip.id}-${Date.now()}-${file.name}`;
    const up = await supabase.storage.from("trip-photos").upload(path, file, { upsert: true });
    if (up.error) return fail(up.error);
    const { data } = supabase.storage.from("trip-photos").getPublicUrl(path);
    await updateTrip("hero_image_url", data.publicUrl);
    setStatus("Zapisano obraz główny");
  }
  async function dragEnd(e) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldI = cities.findIndex(c => c.id === e.active.id);
    const newI = cities.findIndex(c => c.id === e.over.id);
    const reordered = arrayMove(cities, oldI, newI).map((c, i) => ({ ...c, sort_order: i + 1 }));
    setCities(reordered);
    await Promise.all(reordered.map(c => supabase.from("cities").update({ sort_order: c.sort_order }).eq("id", c.id)));
  }
  async function addAttraction(cityId) {
    const { data, error } = await supabase.from("attractions").insert({ city_id: cityId, name: "", price: 0, booking_link: "", status: "want", sort_order: attractions.filter(a => a.city_id === cityId).length + 1 }).select().single();
    if (error) return fail(error);
    setAttractions([...attractions, data]);
  }
  async function updateAttraction(id, field, value) {
    const cleanedValue = numericAttractionFields.has(field) ? cleanNumberInput(value, 0) : value;
    setAttractions(attractions.map(a => a.id === id ? { ...a, [field]: cleanedValue } : a));
    const { error } = await supabase.from("attractions").update({ [field]: cleanedValue }).eq("id", id);
    if (error) fail(error);
  }
  async function removeAttraction(id) {
    setAttractions(attractions.filter(a => a.id !== id));
    const { error } = await supabase.from("attractions").delete().eq("id", id);
    if (error) fail(error);
  }
  async function addBudget() {
    const { data, error } = await supabase.from("budget_items").insert({ trip_id: trip.id, label: "Nowy koszt", amount: 0, sort_order: budget.length + 1 }).select().single();
    if (error) return fail(error);
    setBudget([...budget, data]);
  }
  async function updateBudget(id, field, value) {
    const cleanedValue = numericBudgetFields.has(field) ? cleanNumberInput(value, 0) : value;
    setBudget(budget.map(b => b.id === id ? { ...b, [field]: cleanedValue } : b));
    await supabase.from("budget_items").update({ [field]: cleanedValue }).eq("id", id);
  }
  async function removeBudget(id) {
    setBudget(budget.filter(b => b.id !== id));
    await supabase.from("budget_items").delete().eq("id", id);
  }
  async function addChecklist() {
    const { data, error } = await supabase.from("checklist_items").insert({ trip_id: trip.id, label: "Nowy punkt", sort_order: checklist.length + 1 }).select().single();
    if (error) return fail(error);
    setChecklist([...checklist, data]);
  }
  async function updateChecklist(id, field, value) {
    setChecklist(checklist.map(x => x.id === id ? { ...x, [field]: value } : x));
    await supabase.from("checklist_items").update({ [field]: value }).eq("id", id);
  }
  async function removeChecklist(id) {
    setChecklist(checklist.filter(x => x.id !== id));
    await supabase.from("checklist_items").delete().eq("id", id);
  }

  async function importBookingToFirstMatchingCity() {
    if (!bookingImport.trim()) return;
    const parsed = parseBookingText(bookingImport);
    const target = cities.find(c => bookingImport.toLowerCase().includes((c.city || "").toLowerCase())) || cities.find(c => c.nights > 0) || cities[0];
    if (!target) return;
    for (const [field, value] of Object.entries(parsed)) {
      await updateCity(target.id, field, value);
    }
    setBookingImport("");
    setStatus(`Zaimportowano booking do: ${target.city}`);
  }

  async function addRestaurant(cityId, name = "") {
    const { data, error } = await supabase.from("restaurants").insert({
      city_id: cityId,
      name: name || "Nowa restauracja",
      status: "want",
      sort_order: restaurants.filter(r => r.city_id === cityId).length + 1
    }).select().single();
    if (error) return fail(error);
    setRestaurants([...restaurants, data]);
  }
  async function updateRestaurant(id, field, value) {
    setRestaurants(restaurants.map(r => r.id === id ? { ...r, [field]: value } : r));
    const { error } = await supabase.from("restaurants").update({ [field]: value }).eq("id", id);
    if (error) fail(error);
  }
  async function removeRestaurant(id) {
    setRestaurants(restaurants.filter(r => r.id !== id));
    const { error } = await supabase.from("restaurants").delete().eq("id", id);
    if (error) fail(error);
  }
  async function addDayPlan(cityId, item = {}) {
    const { data, error } = await supabase.from("day_plans").insert({
      city_id: cityId,
      title: item.title || "Nowy punkt dnia",
      time_label: item.time_label || "",
      category: item.category || "",
      plan_date: cleanDateInput(item.plan_date || ""),
      status: "plan",
      sort_order: dayPlans.filter(d => d.city_id === cityId).length + 1
    }).select().single();
    if (error) return fail(error);
    setDayPlans([...dayPlans, data]);
  }
  async function updateDayPlan(id, field, value) {
    const cleanedValue = field === "plan_date" ? cleanDateInput(value) : value;
    setDayPlans(dayPlans.map(d => d.id === id ? { ...d, [field]: cleanedValue } : d));
    const { error } = await supabase.from("day_plans").update({ [field]: cleanedValue }).eq("id", id);
    if (error) fail(error);
  }
  async function removeDayPlan(id) {
    setDayPlans(dayPlans.filter(d => d.id !== id));
    const { error } = await supabase.from("day_plans").delete().eq("id", id);
    if (error) fail(error);
  }
  async function generateDayPlan(city) {
    const existing = dayPlans.filter(d => d.city_id === city.id);

    if (existing.length) {
      await Promise.all(existing.map(item => supabase.from("day_plans").delete().eq("id", item.id)));
      setDayPlans(dayPlans.filter(d => d.city_id !== city.id));
    }

    const skeleton = smartDaySkeleton(city.city, city.start_date);
    const inserted = [];

    for (const item of skeleton) {
      const { data, error } = await supabase.from("day_plans").insert({
        city_id: city.id,
        title: item.title || "Nowy punkt dnia",
        time_label: item.time_label || "",
        category: item.category || "",
        plan_date: cleanDateInput(item.plan_date || ""),
        status: "plan",
        sort_order: inserted.length + 1
      }).select().single();

      if (error) return fail(error);
      inserted.push(data);
    }

    setDayPlans([...dayPlans.filter(d => d.city_id !== city.id), ...inserted]);
    setStatus(`Odświeżono plan dnia: ${city.city}`);
  }
  async function addPackingItem() {
    const { data, error } = await supabase.from("packing_items").insert({
      trip_id: trip.id,
      label: "Nowa rzecz",
      category: "general",
      sort_order: packing.length + 1
    }).select().single();
    if (error) return fail(error);
    setPacking([...packing, data]);
  }
  async function updatePackingItem(id, field, value) {
    setPacking(packing.map(p => p.id === id ? { ...p, [field]: value } : p));
    const { error } = await supabase.from("packing_items").update({ [field]: value }).eq("id", id);
    if (error) fail(error);
  }
  async function removePackingItem(id) {
    setPacking(packing.filter(p => p.id !== id));
    const { error } = await supabase.from("packing_items").delete().eq("id", id);
    if (error) fail(error);
  }

  if (!supabaseConfigured) return <main className="page"><div className="setup"><h1>Brakuje konfiguracji Supabase</h1><p>Uzupełnij .env.</p></div></main>;
  if (loading) return <main className="page"><div className="loading">Ładuję planner…</div></main>;

  return <main className="page">
    <section className="magHero" style={{ backgroundImage: `linear-gradient(90deg, rgba(19,15,11,.88), rgba(19,15,11,.46)), url("${trip?.hero_image_url || firstCity?.image_url || fallbackImage(firstCity?.city || "")}")` }}>
      <div className="heroEditorial">
        <p className="kicker light">Private travel planner</p>
        <h1>{trip?.name || "Włochy 2026"}</h1>
        <p>Roadtrip od {firstCity?.city || "startu"} do {lastCity?.city || "powrotu"}. Noclegi, atrakcje, budżet i mapa w jednym miejscu.</p>
        <div className="heroMeta">
          <span>{cities.length} przystanków</span>
          <span>{totals.nights} nocy</span>
          <span>{eur(totals.total)} razem</span>
          <span>{eur(totals.total / PEOPLE)} / os.</span>
        </div>
      </div>
      <div className="countdownCard">
        <span>Countdown</span>
        <strong>{countdown === null ? "—" : countdown < 0 ? "w trakcie" : countdown}</strong>
        <small>{countdown === null ? "uzupełnij datę" : countdown < 0 ? "trip wystartował" : "dni do wyjazdu"}</small>
        <button onClick={addCity}>＋ Dodaj miasto</button>
      </div>
    </section>

    <div className="topBar">
      <div>
        <p className="status">{status}</p>
      </div>
      <div className="heroActions">
        <button className="ghost" onClick={() => window.print()}>Eksport PDF</button>
      </div>
    </div>

    <section className="currencyPanel"><div><p className="kicker">Kurs</p><h2>EUR → PLN</h2></div><div className="currencyControls"><label>Kurs<input type="number" step="0.0001" value={rate} onChange={e => { setRate(e.target.value); updateTrip("eur_pln_rate", cleanNumberInput(e.target.value, 4.3)); }} /></label><button className="ghost" onClick={fetchRate}>Pobierz NBP</button></div></section>

    <section className="heroImagePanel">
      <div className="heroImagePreview" style={{ backgroundImage: `url("${trip?.hero_image_url || firstCity?.image_url || fallbackImage(firstCity?.city || "")}")` }} />
      <div>
        <p className="kicker">Hero image</p>
        <h2>Obraz główny</h2>
        <p className="muted">Ten obraz jest niezależny od zdjęć miast i hoteli. Zmienia duże zdjęcie na górze strony.</p>
        <div className="heroImageControls">
          <label>
            Link do obrazu hero
            <input value={trip?.hero_image_url || ""} onChange={e => updateTrip("hero_image_url", e.target.value)} placeholder="https://..." />
          </label>
          <label>
            Upload obrazu hero
            <input type="file" accept="image/*" onChange={e => uploadHeroPhoto(e.target.files?.[0])} />
          </label>
        </div>
      </div>
    </section>

    <section className="automationGrid">
      <article className="automationCard routeCard">
        <p className="kicker">Google Maps</p>
        <h2>Trasa roadtripu</h2>
        <div className="routeSummary">
          <strong>{totalKm} km</strong>
          <span>ok. {totalDriveHours.toFixed(1)} h jazdy</span>
        </div>
        <a className="linkButton" href={googleMapsRouteUrl} target="_blank" rel="noreferrer">Otwórz trasę w Google Maps</a>
      </article>

      <article className="automationCard">
        <p className="kicker">Import</p>
        <h2>Booking paste-in</h2>
        <p className="muted">Wklej tekst potwierdzenia z Booking / maila. Apka spróbuje wyciągnąć hotel, daty, link i kwotę.</p>
        <textarea value={bookingImport} onChange={e => setBookingImport(e.target.value)} placeholder="Wklej tu tekst rezerwacji…" />
        <button onClick={importBookingToFirstMatchingCity}>Importuj do przystanku</button>
      </article>
    </section>

    <section className="routeSegments">
      <p className="kicker">Travel time</p>
      <h2>Szacowany czas między przystankami</h2>
      <div className="segmentList">
        {routeSegments.map((seg, index) => (
          <div className="segment" key={`${seg.from}-${seg.to}-${index}`}>
            <span>{seg.from} → {seg.to}</span>
            <strong>{seg.km || "—"} km</strong>
            <small>{seg.hours ? `ok. ${seg.hours} h` : "dodaj koordynaty"}</small>
          </div>
        ))}
      </div>
    </section>

    <DndContext collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={cities.map(c => c.id)} strategy={verticalListSortingStrategy}><section className="timeline">{timeline.map(step => <TimelineItem key={step.id} step={step} />)}</section></SortableContext></DndContext>

    <section className="stats"><Stat icon="🏨" label="Noclegi" value={eur(totals.hotels)} sub={`${pln(totals.hotels, rate)} / ${eur(totals.hotels / PEOPLE)} os.`}/><Stat icon="🎟️" label="Atrakcje" value={eur(totals.attr)} sub={`${pln(totals.attr, rate)} / ${eur(totals.attr / PEOPLE)} os.`}/><Stat icon="🅿️" label="Parkingi" value={eur(totals.parking)} sub={`${pln(totals.parking, rate)} / ${eur(totals.parking / PEOPLE)} os.`}/><Stat icon="💰" label="Razem" value={eur(totals.total)} sub={`${pln(totals.total, rate)} / ${eur(totals.total / PEOPLE)} os.`}/></section>

    <section className="mapSection"><p className="kicker">Mapa trasy</p><h2>Przebieg roadtripu</h2><div className="leafletWrap">{mapPoints.length ? <MapContainer center={mapPoints[0]} zoom={5} scrollWheelZoom={false} className="leafletMap"><TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><FitBounds points={mapPoints} />{timeline.filter(c => Number(c.latitude) && Number(c.longitude)).map(c => <Marker key={c.id} position={[Number(c.latitude), Number(c.longitude)]} icon={markerIcon}><Popup>{c.city}</Popup></Marker>)}<Polyline positions={mapPoints} /></MapContainer> : <div className="mapEmpty">Dodaj współrzędne miast.</div>}</div></section>

    <section className="budgetBreakdown"><p className="kicker">Podsumowanie</p><h2>Koszty dla 2 osób</h2><div className="budgetGrid"><BudgetCell label="Noclegi / os." value={eur(totals.hotels / PEOPLE)} sub={pln(totals.hotels / PEOPLE, rate)}/><BudgetCell label="Atrakcje / os." value={eur(totals.attr / PEOPLE)} sub={pln(totals.attr / PEOPLE, rate)}/><BudgetCell label="Inne / os." value={eur((totals.other + totals.parking) / PEOPLE)} sub={pln((totals.other + totals.parking) / PEOPLE, rate)}/><BudgetCell label="Całość / os." value={eur(totals.total / PEOPLE)} sub={pln(totals.total / PEOPLE, rate)}/></div></section>

    <section className="twoCol"><Checklist items={checklist} add={addChecklist} update={updateChecklist} remove={removeChecklist}/><Budget items={budget} add={addBudget} update={updateBudget} remove={removeBudget} rate={rate}/></section>

    <section className="smartPanel">
      <div>
        <p className="kicker">Smart alerts</p>
        <h2>Braki do uzupełnienia</h2>
      </div>
      <div className="alertGrid">
        {cities.map(city => {
          const alerts = missingAlerts(city, attractions.filter(a => a.city_id === city.id));
          return <div className="alertCard" key={city.id}>
            <strong>{city.city}</strong>
            {alerts.length ? alerts.map(a => <span key={a}>{a}</span>) : <em>kompletne</em>}
          </div>;
        })}
      </div>
    </section>

    <PackingPanel items={packing} add={addPackingItem} update={updatePackingItem} remove={removePackingItem} />

    <input className="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Szukaj przystanku, noclegu, atrakcji…" />

    <section className="cities">{visibleCities.map((city, i) => <CityCard key={city.id} city={city} index={i} attractions={attractions.filter(a => a.city_id === city.id)} restaurants={restaurants.filter(r => r.city_id === city.id)} dayPlans={dayPlans.filter(d => d.city_id === city.id)} weather={weather[city.id]} updateCity={updateCity} removeCity={removeCity} addAttraction={addAttraction} updateAttraction={updateAttraction} removeAttraction={removeAttraction} addRestaurant={addRestaurant} updateRestaurant={updateRestaurant} removeRestaurant={removeRestaurant} addDayPlan={addDayPlan} updateDayPlan={updateDayPlan} removeDayPlan={removeDayPlan} generateDayPlan={generateDayPlan} uploadPhoto={uploadPhoto} rate={rate}/>)}</section>
  </main>;
}

function TimelineItem({ step }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: step.id });
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="timelineItem"><div className="timelineDrag" {...attributes} {...listeners}>↕</div><div className="timelinePhoto" style={{ backgroundImage: `url("${step.photo}")` }}/><div className="timelineBody"><div className="timelineTopline"><span className={`statusPill status-${step.status || "plan"}`}>{step.status || "plan"}</span><span className="timelineDateStatic">{step.date}</span></div><div className="timelineTitleStatic">{step.city}</div><div className="timelineDescriptionStatic">{step.notes || step.area || "Opis do uzupełnienia"}</div></div></article>;
}
function Stat({ icon, label, value, sub }) { return <article className="stat"><div className="statIcon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>; }
function BudgetCell({ label, value, sub }) { return <div className="budgetCell"><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>; }

function Checklist({ items, add, update, remove }) {
  return <section className="panel"><div className="panelHeader"><div><p className="kicker">Checklist</p><h2>Do ogarnięcia</h2></div><button className="ghost" onClick={add}>＋ Dodaj</button></div><div className="checklist">{items.map(x => <div className="checkItem" key={x.id}><input type="checkbox" checked={!!x.is_done} onChange={e => update(x.id, "is_done", e.target.checked)}/><input value={x.label || ""} onChange={e => update(x.id, "label", e.target.value)}/><button className="ghost danger" onClick={() => remove(x.id)}>🗑️</button></div>)}</div></section>;
}
function Budget({ items, add, update, remove, rate }) {
  const total = items.reduce((s, x) => s + Number(x.amount || 0), 0);
  return <section className="panel"><div className="panelHeader"><div><p className="kicker">Inne koszty</p><h2>{eur(total)} / {pln(total, rate)}</h2></div><button className="ghost" onClick={add}>＋ Dodaj</button></div><div className="budgetList">{items.map(x => <div className="budgetItem" key={x.id}><input value={x.label || ""} onChange={e => update(x.id, "label", e.target.value)}/><input value={x.category || ""} onChange={e => update(x.id, "category", e.target.value)}/><input type="number" value={x.amount || 0} onChange={e => update(x.id, "amount", e.target.value)}/><label className="paidLabel"><input type="checkbox" checked={!!x.is_paid} onChange={e => update(x.id, "is_paid", e.target.checked)}/> paid</label><button className="ghost danger" onClick={() => remove(x.id)}>🗑️</button></div>)}</div></section>;
}

function PackingPanel({ items, add, update, remove }) {
  return <section className="smartPanel packingPanel">
    <div className="panelHeader">
      <div>
        <p className="kicker">Packing list</p>
        <h2>Pakowanie</h2>
      </div>
      <button className="ghost" onClick={add}>＋ Dodaj</button>
    </div>
    <div className="packingGrid">
      {items.map(item => <div className="packingItem" key={item.id}>
        <input type="checkbox" checked={!!item.is_packed} onChange={e => update(item.id, "is_packed", e.target.checked)} />
        <input value={item.label || ""} onChange={e => update(item.id, "label", e.target.value)} />
        <input value={item.category || ""} onChange={e => update(item.id, "category", e.target.value)} />
        <button className="ghost danger" onClick={() => remove(item.id)}>🗑️</button>
      </div>)}
    </div>
  </section>;
}

function CityCard({ city, index, attractions, restaurants, dayPlans, weather, updateCity, removeCity, addAttraction, updateAttraction, removeAttraction, addRestaurant, updateRestaurant, removeRestaurant, addDayPlan, updateDayPlan, removeDayPlan, generateDayPlan, uploadPhoto, rate }) {
  const n = Number(city.nights) || 0, hotel = Number(city.cost) || 0, attrTotal = attractions.reduce((s, a) => s + Number(a.price || 0), 0);
  return <article className="card"><aside><div className="hotelThumb" style={{ backgroundImage: `url("${city.hotel_image_url || fallbackImage(city.city)}")` }}/><div className="cardTop"><div><small>Przystanek {index + 1}</small><input className="cityName" value={city.city || ""} onChange={e => updateCity(city.id, "city", e.target.value)}/><div className="quickLinks">{city.booking_url && <a className="quickButton" href={city.booking_url} target="_blank" rel="noreferrer">Booking</a>}{attractions.filter(a => a.booking_link).map(a => <a key={a.id} className="quickButton ghost" href={a.booking_link} target="_blank" rel="noreferrer">{a.name || "Atrakcja"}</a>)}</div></div><button className="ghost danger" onClick={() => removeCity(city.id)}>🗑️</button></div><label>Status<select value={city.status || "plan"} onChange={e => updateCity(city.id, "status", e.target.value)}>{statuses.map(s => <option key={s} value={s}>{s}</option>)}</select></label><label>Kraj<select value={city.country || inferCountry(city.city)} onChange={e => updateCity(city.id, "country", e.target.value)}><option value="Włochy">Włochy</option><option value="Polska">Polska</option><option value="Austria">Austria</option><option value="Słowenia">Słowenia</option><option value="Niemcy">Niemcy</option><option value="Czechy">Czechy</option></select></label>
        <div className="weatherMini">
          <span>Pogoda teraz</span>
          <strong>{weather?.temp !== undefined ? `${weather.temp}°C` : "—"}</strong>
          <small>{weather?.wind !== undefined ? `wiatr ${weather.wind} km/h` : "prognoza bliżej terminu / dodaj koordynaty"}</small>
        </div>
        <label>Od<input type="date" value={city.start_date || ""} onChange={e => updateCity(city.id, "start_date", e.target.value)}/></label><label>Do<input type="date" value={city.end_date || ""} onChange={e => updateCity(city.id, "end_date", e.target.value)}/></label><div className="nights"><span>Liczba nocy</span><strong>{city.nights || 0}</strong></div></aside><div className="content collapsedContent"><details open><summary>Podstawowe</summary><div className="fields"><label>Nocleg<input value={city.accommodation || ""} onChange={e => updateCity(city.id, "accommodation", e.target.value)}/></label><label>Dzielnica<input value={city.area || ""} onChange={e => updateCity(city.id, "area", e.target.value)}/></label><label>Transport<input value={city.transport || ""} onChange={e => updateCity(city.id, "transport", e.target.value)}/></label><label>Notatki<textarea value={city.notes || ""} onChange={e => updateCity(city.id, "notes", e.target.value)}/></label></div></details><details><summary>Nocleg, Booking i koszty</summary><div className="fields"><label>Kwota noclegu za całość (€)<input type="number" value={city.cost || 0} onChange={e => updateCity(city.id, "cost", e.target.value)}/></label><div className="miniStats"><BudgetCell label="Za noc" value={eur(n ? hotel / n : 0)} sub={pln(n ? hotel / n : 0, rate)}/><BudgetCell label="Za osobę" value={eur(hotel / PEOPLE)} sub={pln(hotel / PEOPLE, rate)}/><BudgetCell label="Osoba / noc" value={eur(n ? hotel / PEOPLE / n : 0)} sub={pln(n ? hotel / PEOPLE / n : 0, rate)}/></div><label>Link Booking<input value={city.booking_url || ""} onChange={e => updateCity(city.id, "booking_url", e.target.value)}/></label>{city.booking_url && <a className="linkButton" href={city.booking_url} target="_blank" rel="noreferrer">Otwórz Booking</a>}<div className="geoGrid"><label>Check-in<input value={city.checkin_time || ""} onChange={e => updateCity(city.id, "checkin_time", e.target.value)}/></label><label>Check-out<input value={city.checkout_time || ""} onChange={e => updateCity(city.id, "checkout_time", e.target.value)}/></label></div><label>Koszt parkingu (€)<input type="number" value={city.parking_cost || 0} onChange={e => updateCity(city.id, "parking_cost", e.target.value)}/></label></div></details><details><summary>Zdjęcia i mapa</summary><div className="fields"><label>Zdjęcie timeline URL<input value={city.image_url || ""} onChange={e => updateCity(city.id, "image_url", e.target.value)}/></label><label>Upload timeline<input type="file" accept="image/*" onChange={e => uploadPhoto(city.id, e.target.files?.[0], "image_url")}/></label><label>Miniaturka hotelu URL<input value={city.hotel_image_url || ""} onChange={e => updateCity(city.id, "hotel_image_url", e.target.value)}/></label><label>Upload hotelu<input type="file" accept="image/*" onChange={e => uploadPhoto(city.id, e.target.files?.[0], "hotel_image_url")}/></label><div className="geoGrid"><label>Latitude<input value={city.latitude || ""} onChange={e => updateCity(city.id, "latitude", e.target.value)}/></label><label>Longitude<input value={city.longitude || ""} onChange={e => updateCity(city.id, "longitude", e.target.value)}/></label></div></div></details><details>
          <summary>Plan dnia</summary>
          <div className="fields">
            <div className="rowTitle"><span>Plan dnia / mini itinerary</span><button className="ghost" onClick={() => generateDayPlan(city)}>Smart regenerate</button><button className="ghost" onClick={() => addDayPlan(city.id)}>＋ Dodaj</button></div>
            <p className="hint">Smart regenerate zastępuje istniejący plan dla tego miasta, więc nie tworzy duplikatów.</p>
            {dayPlans.map(item => <div className="dayPlanRow" key={item.id}>
              <input value={item.time_label || ""} onChange={e => updateDayPlan(item.id, "time_label", e.target.value)} placeholder="Godzina" />
              <input type="date" value={item.plan_date || ""} onChange={e => updateDayPlan(item.id, "plan_date", e.target.value)} />
              <input value={item.title || ""} onChange={e => updateDayPlan(item.id, "title", e.target.value)} placeholder="Punkt dnia" />
              <select value={item.status || "plan"} onChange={e => updateDayPlan(item.id, "status", e.target.value)}><option value="plan">plan</option><option value="done">done</option><option value="skip">skip</option></select>
              <button className="ghost danger" onClick={() => removeDayPlan(item.id)}>🗑️</button>
            </div>)}
          </div>
        </details>

        <details>
          <summary>Restauracje</summary>
          <div className="fields">
            <div className="rowTitle"><span>Restauracje / foodie list</span><button className="ghost" onClick={() => addRestaurant(city.id)}>＋ Dodaj</button></div>
            <div className="recommendations">
              {smartRestaurants(city.city).map((item, idx) => <button className="recommendation" key={idx} onClick={() => addRestaurant(city.id, item)}>{item}</button>)}
            </div>
            {restaurants.map(r => <div className="restaurantRow" key={r.id}>
              <input value={r.name || ""} onChange={e => updateRestaurant(r.id, "name", e.target.value)} placeholder="Restauracja" />
              <input value={r.cuisine || ""} onChange={e => updateRestaurant(r.id, "cuisine", e.target.value)} placeholder="Kuchnia" />
              <input value={r.price_level || ""} onChange={e => updateRestaurant(r.id, "price_level", e.target.value)} placeholder="€€" />
              <input value={r.booking_link || ""} onChange={e => updateRestaurant(r.id, "booking_link", e.target.value)} placeholder="Link" />
              {r.booking_link && <a className="smallLink" href={r.booking_link} target="_blank" rel="noreferrer">Otwórz</a>}
              <button className="ghost danger" onClick={() => removeRestaurant(r.id)}>🗑️</button>
            </div>)}
          </div>
        </details>

        <details>
          <summary>AI rekomendacje</summary>
          <div className="recommendations">
            {cityRecommendation(city.city).map((item, idx) => <div className="recommendation" key={idx}>{item}</div>)}
          </div>
        </details>
        <details><summary>Atrakcje — {eur(attrTotal)} / os. {eur(attrTotal / PEOPLE)}</summary><div className="fields"><div className="rowTitle"><span>Atrakcje</span><button className="ghost" onClick={() => addAttraction(city.id)}>＋ Dodaj</button></div>{attractions.map(a => <div className="attractionRow" key={a.id}><input value={a.name || ""} onChange={e => updateAttraction(a.id, "name", e.target.value)} placeholder="Atrakcja"/><select value={a.status || "want"} onChange={e => updateAttraction(a.id, "status", e.target.value)}><option value="want">want</option><option value="booked">booked</option><option value="done">done</option><option value="skipped">skipped</option></select><input type="number" value={a.price || 0} onChange={e => updateAttraction(a.id, "price", e.target.value)} placeholder="€"/><input value={a.booking_link || ""} onChange={e => updateAttraction(a.id, "booking_link", e.target.value)} placeholder="Link"/>{a.booking_link && <a className="smallLink" href={a.booking_link} target="_blank" rel="noreferrer">Otwórz</a>}<button className="ghost danger" onClick={() => removeAttraction(a.id)}>🗑️</button></div>)}</div></details></div></article>;
}

createRoot(document.getElementById("root")).render(<App />);
