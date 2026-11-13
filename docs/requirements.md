# Cheap Flights in Europe: requirements

## About the project

The main goal is to search for cheap flights across Europe from low-cost airlines.

## Requirements

| # | Requirement | Status |
| - | ----------- | ------ |
| 1 | An **interactive map** where the user discovers which routes they can take. | ✅ Done. The **Routes** page: a full-screen map of Ryanair's network that you can drag and zoom. Click an airport to see its direct flights. |
| 2 | **Search boxes** for country, airport, origin and destination, so the user can find the cheapest tickets quickly. | ✅ Done, as airport-first search boxes. **From** takes a city, airport name or code. **To** takes an airport or "Any airport in {country}". |
| 3 | The user can **save routes in a JSON file and upload it** to the app. The app then searches for the cheapest date and route using their parameters. | 🟡 Partly done. Routes are saved in this browser (`localStorage`), and one click fills the search. JSON export/upload and searching a whole list of routes at once are not built yet. |
| 4 | The user can **search cheap flights for the period they want**, for example Thursday to Monday or Wednesday to Monday. | ✅ Done. See *Search by weekdays* below. |
| 5 | The app **doesn't need an account**. | ✅ Done. There are no accounts. Saved routes stay in the browser, and the chosen route is kept in the URL. |
| 6 | **Several departure airports**: someone living between airports (e.g. a student in Aachen) can fly from any of them, e.g. Cologne or Dusseldorf Weeze. Only for the origin. | ✅ Done. See *Several departure airports* below. |

## Search by weekdays (requirement 4)

The user picks the days they want to travel. The app finds the cheapest round trip for every week in a period, so they can see which dates are cheapest.

**How it works for the user** (Search page, *Round trip on set days*, the default):

1. Choose **From** and **To**: an airport or "Any airport in {country}".
2. Choose the days:
   - a preset: **Thu → Mon**, **Wed → Mon**, **Fri → Tue** or **Fri → Sun**;
   - or any pair with **Leave on** / **Come back on**.
   - A summary shows the length and the number of options, e.g. "4 nights · 13 departures to compare".
3. Choose the period: **First departure** and **Last departure**, at most 92 days (about three months).
   - Both are lists of whole trips on the chosen days, e.g. "Thu 3 Dec → Mon 7 Dec 2026", so a date that doesn't match can't be picked.
   - They default to the next trip and 8 weeks later, and move along when the days change.
4. **Find the cheapest dates** runs the search. A loading indicator covers the form and says what is happening, e.g. "Comparing 9 Thursday → Monday trips from Cologne to Palma de Mallorca". Then it shows every matching trip, cheapest first. Each row shows:
   - the dates, e.g. "Thu 11 Feb → Mon 15 Feb";
   - the destination;
   - both flights' times, flight numbers and prices;
   - the total. The cheapest row is marked.

**Rules:**

- **Return day:** the return is on the first chosen weekday after departure. Thursday → Monday is 4 nights; Friday → Friday is 7 nights.
- **One price per week:**
  - Every departure day in the period is compared, e.g. every Thursday from 1 Dec to 28 Feb.
  - With a single destination there is one trip per week.
  - With "Any airport in a country" there is one trip per week for each airport in it.
- **Invalid periods are rejected, with a message:**
  - a period with no departure day in it (e.g. no Thursday);
  - a period longer than 92 days;
  - a last departure before the first.
- **Prices** are for one adult, both flights, in the chosen currency.
- **Direct flights only** (Ryanair).
- **One way** is still available for single flights on any day in a date range.

**API:**

```
GET /flights/trips?origin=CGN&destination=PMI&date_from=2026-12-01&date_to=2027-02-28&depart_day=thursday&return_day=monday&currency=EUR
```

- Use `destination_country=ES` instead of `destination` for any airport in a country.
- The backend makes one Ryanair round-trip fare query per week, four at a time. A three-month period takes about 2–3 seconds.

## Several departure airports (requirement 6)

**How it works for the user:**

1. Choose **From** and **To** as usual, e.g. Cologne → Palma de Mallorca.
2. **Also fly from** appears below. Add up to two more departure airports:
   - a one-click suggestion of a nearby airport, e.g. "+ Dusseldorf Weeze 92 km";
   - or any airport that flies to the destination, from the "Add a departure airport" box.
3. Search as usual. Each result shows which airport the flight leaves from and lands at.

**Rules:**

- **At most 3 departure airports**, and every one must fly directly to the destination (or to the destination country).
- **One way:** the cheapest flights from any of them.
- **Round trip:** out from any of them and back to any of them, whichever is cheapest. Out from Weeze and back to Cologne is allowed.
- **Destination only:** extra airports are only for the departure; the destination stays a single airport or country.
- **Nearest airports to Aachen** that Ryanair flies from: Cologne (75 km), Eindhoven (90 km), Dusseldorf Weeze (92 km), Brussels (113 km), Brussels Charleroi (120 km). Ryanair's "Dusseldorf" is Weeze, not Düsseldorf's main airport.

**API:** repeat `origin`, e.g. `GET /flights/trips?origin=CGN&origin=NRN&destination=PMI&…`.

- With one departure airport, the backend uses Ryanair's round-trip fares (one query per week).
- With several, round-trip fares can't land at another airport. So it combines one-way fares:
  - one query per departure airport and week for the way out;
  - one query per destination airport and week for the way back;
  - then, per week and destination airport, the cheapest flight out plus the cheapest flight back to any departure airport.
- Live examples:
  - Cologne + Weeze → Palma, Thursday to Monday over three months: 3.7 s. The best trip was €75.98, out from Weeze and back to Cologne, cheaper than the best Cologne-only trip (€83.83).
  - Three airports to any airport in Spain: about 7 s.

## Not built yet (from the README's vision)

- Other low-cost airlines (easyJet, Wizz Air, Vueling, …).
- Departure and arrival time windows.
- Price caps, and price alerts.
- Saved routes as a JSON file, and searching all of them at once (requirement 3).
