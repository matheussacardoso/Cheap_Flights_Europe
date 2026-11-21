# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Finds cheap, direct, low-cost flights in Europe for long-weekend trips. The root `README.md` describes the product vision: multi-airline search, Thu–Mon and Fri–Tue presets, time windows and price caps. `docs/requirements.md` lists the requirements and what is built.

Today the app covers Ryanair flights, through `ryanair-py`. It has one-way searches, and round trips on set weekdays (e.g. every Thursday to Monday in a period). Round trips are also compared with Flixbus buses between the airports' cities ("plane or bus?", `/bus/*`). Multi-airline search, time windows and price caps are not built yet.

- `backend/`: FastAPI service (Python ≥ 3.12)
- `frontend/`: Angular 22 single-page app (standalone components, zoneless, Vitest)

## Commands

### Backend (run from `backend/`)

```bash
pip install -r requirements-dev.txt          # dev deps (pytest, httpx2, ruff)
cp .env.example .env                          # optional; settings have defaults
uvicorn app.main:app --reload                 # dev server on :8000, docs at /docs
pytest                                        # all tests (config in pyproject.toml)
pytest tests/test_flights.py::test_name       # single test
ruff check . && ruff format .                 # lint + format (line length 100)
gunicorn app.main:app -c gunicorn.conf.py     # production (Linux/Docker only, not Windows)
```

`requirements*.txt` are the pinned lock files. When you add a dependency, update `pyproject.toml` too.

### Frontend (run from `frontend/`)

```bash
npm install
npm start                                     # ng serve on :4200
npm run build
npm test                                      # ng test (Vitest + jsdom)
npx ng test --include src/app/services/trip-selection.spec.ts   # single spec file
npm run lint                                  # ng lint (angular-eslint, eslint.config.js)
npx prettier --write src                      # formatting (.prettierrc)
npm run build:map                             # regenerate public/maps/europe.json (after upgrading world-atlas)
```

## Architecture

### Backend layering

`api/routes → api/dependencies → services → external SDKs/APIs`, with `schemas` and `core` shared across layers. New features follow the same shape: a router in `api/routes/` (registered in `main.py`), request/response models in `schemas/`, business logic and third-party calls in a service in `services/`, and wiring in `api/dependencies.py`.

- `app/main.py`: the `create_app(settings)` factory. It sets up logging, middleware, CORS, exception handlers, routers and the `lifespan`.
- `app/core/`: cross-cutting code. `config.py` holds `Settings`, `logging.py` + `middleware.py` handle structured logs with a per-request `request_id`, and `exceptions.py` holds domain exceptions plus the handlers that map them to HTTP responses.
- Routes stay thin. They don't catch exceptions or talk to SDKs directly. Services raise domain exceptions, and the handlers in `core/exceptions.py` turn them into HTTP responses.
- External data has three sources:
  - Fares come from `ryanair-py`, which is sync, through `FlightService` and `/flights/*`.
    - `ryanair-py` drops the `arrivalDate` Ryanair sends; `_with_arrival_times()` wraps its parser so flights keep `arrivalTime`. Flight times have no offset (local to each airport); airports carry their `timeZone` (`/network/airports`) for durations.
    - `/flights/cheapest` returns one-way fares.
    - `/flights/trips` returns round trips on set weekdays (at most 92 days), cheapest first. The fare queries run on a small thread pool inside the sync service.
    - Both take 1 to 3 departure airports as a repeated `origin` param.
    - With one departure airport, `/flights/trips` makes one Ryanair round-trip query per week.
    - With several, the return may land at another of them, which round-trip fares can't express. `_open_jaw_trips` combines one-way fares instead: outbound per origin and week, return per destination airport and week.
  - The route network (active airports and the direct routes per airport) comes from Ryanair's unofficial public website API, through `NetworkService` and `/network/*`. It is async, uses the shared `httpx.AsyncClient` created in the `lifespan`, and keeps an in-memory TTL cache per worker. Because that API is unofficial, any upstream or parsing failure becomes a 502.
  - Buses (cities, routes and fares) come from Flixbus's unofficial public API (`global.api.flixbus.com`), through `BusNetworkService` and `BusService` and `/bus/*`. Both are async and share a second `httpx.AsyncClient` from the `lifespan`. We call the API directly: the `flixbus` PyPI package installs a global `requests_cache` on import (which would also cache Ryanair's calls), writes SQLite files and scrapes HTML.
    - Cities are identified by UUID, not IATA codes. `/bus/cities` lists all of them (paged upstream with `offset`) and `/bus/routes` lists the cities reachable from 1 to 3 departure cities, with `direct: false` when a change is needed. Both only keep cities in Europe and nearby (`SERVED_COUNTRIES`: Europe, Turkey, the Caucasus, North Africa and the Middle East), so Flixbus's cities in the Americas, India and Australia never appear. Both are TTL-cached like `NetworkService`. Routes are per city, not per country: a country such as Germany has over 1,000 Flixbus cities.
    - Flixbus searches one city pair and one day per query, and can't search "to anywhere", so bus searches need `destination` or `destination_country`. A country means its `MAX_COUNTRY_DESTINATIONS` most popular cities reachable from the origins. `/bus/cheapest` returns the cheapest ride per day and city pair (at most 14 days). `/bus/trips` builds every round trip from one-way rides, like `_open_jaw_trips`, so the return may end at another departure city.
    - `/bus/airport-cities` links each Ryanair airport to a Flixbus city, through `AirportCityService` (`match_airport_cities`): the city Ryanair names for the airport (same country, within `SAME_NAME_MAX_KM`, accents ignored), else the nearest city within `NEAREST_MAX_KM`. About 177 of 222 airports match. It's how the frontend compares flights with buses.
    - Rides may include changes (`transfers`, and the change cities' names in `via`, looked up from the cached city list). Prices include Flixbus's platform fee. Searches that would need more than `MAX_FARE_QUERIES` queries are refused with a 422 (`InvalidSearchError`) before the first one, and so are Flixbus's own 400s (unknown city, past date).
- Ryanair's fare API only matches **lowercase** country codes (`es`, not `ES`). The API accepts uppercase codes, and `FlightService` lowercases them.

### Backend rules (apply to all backend code)

**Concurrency**
- Never call blocking code (`requests`, `time.sleep`, sync file or DB I/O) inside `async def`. Code that calls it must be a plain `def`, which FastAPI runs in a threadpool.
- Prefer non-blocking libraries (`httpx.AsyncClient`, async DB drivers, `asyncio.sleep`) for new I/O, and make that whole call path `async def`. Don't call sync services from async routes.
- Dependencies follow the same sync/async rule as endpoints.
- Keep CPU-heavy or long-running work out of request handlers. Small concurrent I/O can use `asyncio.gather`. Heavy computation or long jobs go through a queue + worker, with results stored for the API to read. Heavy ML belongs in a dedicated inference service.
- Use `BackgroundTasks` only for short fire-and-forget work that can be lost if the process dies. Anything that needs guaranteed delivery, retries or a long runtime goes in a queue + worker.

**Pydantic and responses**
- Every model inherits from `AppBaseModel` (`schemas/base.py`), which holds the shared config and global JSON encoders. API response models inherit from `CamelModel`. Don't define per-model encoders.
- Don't build response models by hand. Return objects from services and let the route's `response_model` validate and convert them (`from_attributes=True`).
- Validate in Pydantic models, not in endpoint code. Use types and `Field` constraints first, then `field_validator`/`model_validator` on the model.
- Validation that needs I/O (for example, a DB lookup) goes in a reusable dependency.

**Resources and config**
- Create shared clients (HTTP clients, DB pools, Redis) once in the `lifespan`: store them on `app.state`, close them after `yield`, and inject them through `Depends`. Never open a connection per request.
- All config comes from `Settings` (`core/config.py`). Add new settings to both `Settings` and `.env.example`. Never hardcode secrets, URLs or ports.
- Interactive docs and the OpenAPI schema stay disabled in production.

**Logging**
- Use `logging.getLogger(__name__)` with context passed via `extra={...}` and the right level. Never use `print`. The request ID is added automatically. `extra` keys must not clash with built-in `LogRecord` attributes such as `message`, `name` or `args`.

**Deployment**
- Production runs gunicorn with uvicorn workers and uvloop, using `(cores * 2) + 1` workers (`gunicorn.conf.py`, `WEB_CONCURRENCY`). On Windows, use `uvicorn` directly.

### Backend/frontend contract

- Query parameters are **snake_case**. JSON responses are **camelCase** (via `CamelModel`). The TypeScript interfaces in the frontend services mirror the backend schemas. When you change an endpoint or schema, update both sides in the same change.
- The frontend's API base URL is a single constant in `src/app/services/api.ts` (`http://127.0.0.1:8000`). The backend's `CORS_ORIGINS` setting must include the frontend's origin.

### Frontend

- Angular standalone components (no NgModules). Each feature is a component folder in `src/app/components/`, HTTP calls live in services in `src/app/services/`, and routes are registered in `app.routes.ts`.
- The app is **zoneless** (`provideZonelessChangeDetection()`), so UI updates must come from signals or template events, not zone.js-triggered change detection.
- **Routes, map and nav bar UI rules:** see `frontend/docs/routes-and-map.md`. Update it when you change how these screens behave.
- **Pages:** a nav bar (`components/nav-bar/`) links two pages. **Routes** (`/`, `components/routes-page/`) is a full-screen map with a sidebar. **Search** (`/search`, `components/search-page/`) has the dates and the price search. One-way results are at `/search/results` (`components/flight-results-page/`), and round trips on set weekdays at `/search/trips` (`components/trip-results-page/`). Both read the last search from `SearchResults` (`services/search-results.ts`), in memory only. Pages are lazy-loaded in `app.routes.ts`. Weekday presets and the period maths are in `services/trip-period.ts`.
- **HTTP:** `FlightHttpClient` (`/flights/*`), `NetworkHttpClient` (`/network/*`), `BusHttpClient` (`/bus/trips`) and `BusNetworkHttpClient` (`/bus/airport-cities`, `/bus/routes`) are stateless wrappers around `HttpClient`; the network ones cache for the session. `toHttpParams()` in `services/api.ts` builds query params. `MapData` loads the static map shapes.
- **Plane or bus:** the app stays airport-based; Flixbus is only compared. `BusAvailability` (`services/bus-availability.ts`) links the trip's airports to Flixbus cities: `busToAirport` (destinations the departure city's buses reach, for the "🚌 Bus too" tags and the map's green rings), `busTrip` (the bus side of the trip) and `compareNote` (why it can't compare, or ''). It requests nothing until a page calls `load()` (Routes and Search do).
  - A round-trip search runs `/flights/trips` and `/bus/trips` together (`forkJoin`); the bus side never fails the search, it stores a note instead (`SearchResults.busNote`). One-way stays flights only.
  - `TripResultsPage` puts them side by side per week (`RoundTripCell` for each side) with a verdict. Show times with `clockTime()` and durations with `durationMinutes()` (`services/ride-summary.ts`), never the date pipe: times are local to each stop.
- **Trip state:** `TripSelection` (`services/trip-selection.ts`) is the single source of truth for the trip, airport first: `origins` (1 to 3 airports), then either `destination` (an airport) or `destinationCountry` ("any airport in a country", which maps to a `destination_country` search).
  - `origin` is the first, main departure airport; destinations and map lines come from it.
  - Extra departures can only be added once a destination is chosen, and must fly there. Which airports do is read from the destination country's routes.
  - It's a signals store. Routes load per country and are cached in `routesByCountry`. `destinations` and `reachableCountries` are computed from them. Changing the origin clears the destination. Once routes load, a destination without a direct flight is dropped.
  - Every view reads and writes this store, not its own state: the From/To boxes (`components/trip-fields/`), the destination list and the map.
  - `syncTripWithUrl()` (`services/trip-url.ts`) mirrors the trip into the query params (`?from=CGN&to=PMI`, `&to_country=ES`, or `?from=CGN,NRN` for several departures) and restores it on load. Call it from each page's constructor. Other in-memory data (search results) is still lost on reload.
- **Airport search:** `components/airport-search/` is a reusable ARIA combobox. Matching ignores accents and case, and checks names, cities, codes and countries.
- **Saved routes:** `SavedRoutes` (`services/saved-routes.ts`) keeps the user's saved trips in `localStorage`, reached through the `BROWSER_STORAGE` token (`services/browser-storage.ts`) (key `cheap-flights.saved-routes.v2`; v1 routes, with a single `origin`, are migrated on first read). There are no accounts, so routes live in that browser only.
  - Every storage access is wrapped in try/catch, and stored entries are validated on read. When you change the `SavedRoute` shape, bump the key version.
  - Choosing a saved route calls `TripSelection.applyRoute()`.
  - `toFile()` / `importFile()` download and upload them as a JSON file of codes only (`ROUTES_FILE_VERSION`). Names are rebuilt from the loaded airports on upload, and unknown routes are skipped.
- **Map:** `components/trip-map/` draws an SVG with `d3-geo`. Country shapes come from `public/maps/europe.json`, a static file generated by `scripts/build-map.mjs` from `world-atlas`.
  - It fills its parent: a `ResizeObserver` sets the viewBox to the element's size, so one user unit is one CSS pixel before zooming. jsdom has no `ResizeObserver`, so tests use 800×600.
  - Pan and zoom come from `d3-zoom`, applied as a transform on one `<g>`. Dot radius, text size and arrow size are divided by the zoom `k`, so they stay the same size on screen. The map zooms to the trip whenever it changes.
  - Airport names are placed to avoid collisions, recomputed when a zoom gesture ends. Colors come from the `--color-map-*` and other tokens.
- **Flags:** SVGs from the `flag-icons` package, copied as static assets to `flags/<iso2>.svg` (see `angular.json` assets). Show them with the `flagUrl` pipe (`pipes/flag-url-pipe.ts`): `<img [src]="country | flagUrl" alt="" />`. Don't use the package's CSS: its 4:3 and 1:1 flag folders reuse the same file names, which breaks `ng serve` and `ng test`.
- The app is in English: all user-facing text, code comments and `<html lang="en">`.

### Frontend rules (apply to all frontend code)

`npm run lint` (angular-eslint) enforces most of these; the rest are review rules.

**Components**
- Standalone by default: don't write `standalone: true`, never add an `NgModule`. Every component sets `changeDetection: ChangeDetectionStrategy.OnPush`.
- Inject with `inject()` in field initialisers, never constructor parameters. Injected internals are `private readonly`. Members the template reads (signals, `computed`, event handlers) are `protected`. Only `input()`/`output()` are public, and they are `readonly`.
- Avoid lifecycle hooks: put setup in the constructor, derived state in `computed()`, browser-only setup (`ResizeObserver`, measuring) in `afterNextRender()`, and cleanup in `DestroyRef`/`takeUntilDestroyed()`.
- Lazy-load routed pages with `loadComponent` in `app.routes.ts`.

**Naming**
- No `Component`/`Service` suffixes: `TripMap`, `SavedRoutes`. Routed pages end in `Page` and live in a `*-page/` folder (`SearchPage`, `search-page/search-page.ts`). Wrappers around the backend are `*HttpClient`. Pipes are `*Pipe` in `pipes/*-pipe.ts`. When a component and a service would share a name, the component gets the more specific one (`SavedRoutesList` vs `SavedRoutes`).
- Methods that call an API or change state use verbs such as `fetch`, `search`, `save`, `select`, `add`, `remove`, `toggle` (`fetchAirports()`, not `getAirports()`). Pure checks use `is`/`has`/`can`, pure conversions use `to` (`toHttpParams()`).
- Whole words, plural names for collections, `<key>To<value>` for `Map`s (`countryToRoutes$`). No `I`/`E` prefixes on interfaces or enums.

**State and reactivity**
- Signals first: `signal()` for local state, `computed()` for anything derived, `.set()`/`.update()` with new objects and arrays (never mutate in place). Shared state lives in root signal stores (`TripSelection`, `SavedRoutes`, `SearchResults`) that expose read-only signals.
- HTTP clients are stateless and return observables. The caller stores results in a store.
- `effect()` only syncs signals with non-signal APIs (reactive forms, the router, d3, storage). Never use it to copy one signal into another; use `computed()`/`linkedSignal()`.
- RxJS is for event streams and async orchestration. Clean up manual subscriptions with `takeUntilDestroyed()`.
- Use `HttpClient` for searches the user starts (button clicks). New reactive reads may use `httpResource()`/`rxResource()`. Planned: move the airports, routes and map-shape loading (now manual `subscribe()` with loading/error signals) to resources.

**Templates**
- Built-in control flow only (`@if`, `@for` with a stable `track` key, never `$index` when items have an id, `@switch`). Use `[class.x]`/`[style.x]`, not `ngClass`/`ngStyle`. Use self-closing tags for components without content.
- No method calls in templates except signal reads and event handlers. Precompute view models in `computed()` (e.g. `TripResultsPage.rows`, `TripMap.airportViews`) or use a pure pipe (`flagUrl`).
- Presentational components take lean view models (`SearchOption`, `Pick<…>`), not whole API DTOs.
- No `!` in templates; narrow with `@if (x(); as value)`.

**Platform access**
- Never touch `window`, `document`, `navigator` or `localStorage` directly. Use `inject(DOCUMENT)`, `ViewportScroller`, `BROWSER_STORAGE`, or `afterNextRender()` for browser-only work. Tests then stub these instead of sniffing jsdom.

**Forms**
- Typed reactive forms (`fb.nonNullable.group`). Read controls as `form.controls.name`, never `form.get('name')`. Submit with `(ngSubmit)` on the `<form>`.
- Form state the template shows (errors, touched) comes from `computed()`s that read `toSignal(form.events)`. A control's touched changes don't reach the group's `events`, so merge that control's `events` too.

**TypeScript**
- `strict` and `strictTemplates` are on. Never use `any` (use `unknown` and narrow). Avoid `!` outside tests. Prefer literal unions (`Weekday`, `TripType`) to `string`.
- Data shapes are `interface`/`type`, never classes.

**Tests**
- Blackbox: render the page or component, act through the DOM (click, type, `dispatchEvent`), and assert on the DOM. Don't read or call `protected` members through `componentInstance`. Await `fixture.whenStable()`, never `detectChanges()`.

**Comments** explain *why*, not *what*. Each `TODO`/`FIXME` names an issue (`// TODO #12: …`).

### UI/UX design system (apply to all frontend styling)

- **Spacing:** use an 8pt scale (8, 16, 24, 32, …), with 4px steps allowed only for fine-tuning. Don't introduce arbitrary values without a stated reason.
- **Tokens:** all spacing, sizing, color, radius and shadow values come from the CSS custom properties in `src/styles.css` (`--space-*`, `--control-height`, `--color-*`, …). Never hardcode raw values in component CSS. Shared styles (`.container`, `.btn`, form controls, tables) also live in `src/styles.css`. Component CSS only holds layout specific to that component.
- **Component sizing:** equivalent components (buttons, inputs, selects) share the same height.
- **Hierarchy through proximity:** use smaller spacing inside a group and larger spacing between groups.
- **Consistency:** the same patterns, spacing and sizes apply across all screens.
- **Accessibility:** respect accessibility requirements (semantic HTML, labels on form controls, visible focus states, sufficient color contrast, keyboard navigation).
- **Stability:** don't change the design system (tokens, scales, shared styles) unless the task requires it.

### Tests

- Backend tests never call real external APIs. `backend/tests/conftest.py` provides a `client` (TestClient), fixtures that monkeypatch the external SDK, and `override_service`, which swaps dependencies through `app.dependency_overrides`. Follow the same pattern for new services.
- `override_network` swaps `NetworkService`. Network tests build the service on `httpx.MockTransport`.
- `override_airport_cities` swaps `AirportCityService`; the matching itself is a pure function (`match_airport_cities`), tested directly.
- `override_bus` swaps both bus services. `tests/test_bus.py` builds them on a fake Flixbus upstream (`FakeFlixbus`, on `httpx.MockTransport`).
- Frontend specs live next to the code they test (`*.spec.ts`) and run on Vitest. HTTP calls are mocked with `HttpTestingController`, and shared airport/route fixtures live in `src/app/testing/network-fixtures.ts` (airport ↔ Flixbus city links and bus routes in `bus-fixtures.ts`). Specs of pages that call `BusAvailability.load()` answer its requests with `answerBusNetwork(http)` before `http.verify()`.
