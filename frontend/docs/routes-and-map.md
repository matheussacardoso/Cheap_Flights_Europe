# Routes, map and navigation: UI rules

How the nav bar, the Routes page (map and sidebar) and the Search page behave, and the rules to keep when changing them. This is inspired by FlightConnections and Fly Where To (`references/Design Portfolio.pdf`), but kept simpler: one airline (Ryanair), direct flights only, and Europe only.

The general design system (8pt spacing, tokens, accessibility) is in the root `CLAUDE.md`, under *UI/UX design system*. Everything here follows it.

## 1. Nav bar (`components/nav-bar/`)

- One `mat-toolbar` at the top of every page (inside a `<header>`), `--nav-height` tall (64px), in night blue (`--color-primary`).
- Left: the brand, a gold compass star and "Explore with me" in the display serif, which links to Routes.
- Right of the brand: `<nav aria-label="Main">` with two links:

  | Link   | URL       | Active on                    |
  | ------ | --------- | ---------------------------- |
  | Routes | `/`       | `/` only (exact match)       |
  | Search | `/search` | `/search`, `/search/results` and `/search/trips` |

- The links are Material text buttons. The active one is a solid gold tab with night-blue text, and has `aria-current="page"`. A color change alone is not enough.
- Both links keep the query params (`queryParamsHandling="preserve"`), so the chosen route follows you between pages.
- New pages get a link here only if they are top-level. Results and detail pages live under their parent's URL, so the parent's link stays active.

## 2. Pages

### Routes (`/`, `components/routes-page/`)

A full-screen layout under the nav bar: a sidebar (`--sidebar-width`, 380px) beside the map, which fills the rest. The page itself never scrolls on desktop; the sidebar scrolls on its own.

- **The sidebar is `position: relative`.** Absolutely positioned children (like the visually hidden live regions of the search boxes) are then placed inside it. Without it, they sit below the screen and the whole page scrolls (it grew to 2,670 px once).

The sidebar is split into sections, 24px apart (`--space-6`), with smaller gaps inside each section. From top to bottom:

1. **Title** ("Where will your journey lead?", with an italic gold tagline) **and From/To boxes** (`components/trip-fields/`), with errors and a "Try again" button below.
2. **Route card**, only when the trip is complete: an outlined `mat-card` in gold-tinted sand with "Cologne → Palma de Mallorca" in the display serif, **Search prices** (filled) and **Save route** (outlined, star icon).
3. **Direct flights from X (N)**: a `mat-action-list`, every destination a list item with flag, name, country and code. It is sorted by the name shown, and the chosen one has `aria-pressed="true"`. This list is also the keyboard and screen-reader alternative to the map.
4. **Saved routes.**

New sidebar features (airline or country filters, for example) go in as a new section. Don't put them inside the map.

### Search (`/search`, `components/search-page/`)

A centred card (`.container`). From top to bottom:

1. Saved routes.
2. The From ⇄ To boxes, in a row.
3. **Trip:** a `mat-button-toggle-group` bound to the form, *Round trip on set days* (the default) or *One way*.
4. **Days** (round trip only):
   - a toggle group of presets, **Thu → Mon**, **Wed → Mon**, **Fri → Tue** and **Fri → Sun**; the one matching the chosen days is selected (none when the days match no preset);
   - **Leave on** and **Come back on** `mat-select`s;
   - a live summary, e.g. "4 nights · 13 departures to compare".
5. Dates and currency:
   - **Round trip:** **First departure** and **Last departure** are dropdowns, not free date pickers, so only dates that match the chosen days can be picked (see *Round-trip dates* below).
   - **One way:** date fields (`matInput type="date"`), **Departure from** and an optional **Departure until**.
   - All are outlined `mat-form-field`s; errors show under the field (`mat-error`, or a hint styled as an error for the period, which is checked on the whole form).
6. The submit button, filled and full width: **Find the cheapest dates** (round trip, compass icon) or **Search flights** (one way).

The page opens with the title "Plan your journey" and an italic gold tagline.

#### Round-trip dates

- **Each option is one whole trip**, e.g. "Thu 3 Dec → Mon 7 Dec 2026". The return date is the first chosen return weekday after departure.
- **First departure** lists every departure weekday from today for 52 weeks (`FIRST_DEPARTURE_WEEKS`). Today counts if it is the right weekday.
- **Last departure** lists the same weekday from the first departure, at most 92 days later (14 choices).
- **Layout:** the two date fields use the wider minimum width (`--field-min-width-wide`), so a whole trip fits in the box.
- **Defaults:** the next departure day, and 8 weeks after it (`DEFAULT_PERIOD_WEEKS`), so 9 trips to compare.
- **Changing the days** (a preset or the selects) moves both dates to the new weekday in the same week, and the period keeps its number of weeks. For example, Thu 19 Nov–Thu 14 Jan becomes Fri 20 Nov–Fri 15 Jan.
- **Changing the first departure** keeps the last one if it still fits (same weekday, not earlier, within 92 days). Otherwise the last one moves to 8 weeks after the new first.
- The date maths lives in `services/trip-period.ts`. Today comes from the `TODAY` token, so tests can fix it.

#### Loading

- **While a search runs**, the loading indicator covers the form with a translucent layer (`--color-overlay`), and the form is `inert`, so it can't be changed or sent twice. The indicator is sticky, so it stays in view however far the page is scrolled.
- **It says what is running:**
  - Round trip: "Finding the cheapest dates", then "Comparing 9 Thursday → Monday trips from Cologne to Palma de Mallorca. This takes a few seconds."
  - One way: "Searching flights", then "Looking for flights from X to Y."
- The submit button reads "Searching…" and has `aria-busy`.

Results:

- **After a search the page scrolls to the top**, so the results start at their title, not at the form's scroll position. This is done only there: the router's global scroll reset would also fire on every URL sync of the trip.
- One way: `/search/results`.
- Round trip: `/search/trips`, every trip cheapest first. The cheapest row is highlighted with a "Cheapest" badge.
- **Airports in the results:** each flight shows where it leaves from and lands ("14:55 from Dusseldorf Weeze", "06:15 to Cologne"), since with several departure airports they can differ.

#### Plane or bus (Ryanair vs Flixbus)

Round trips also compare Flixbus buses between the airports' cities (each airport stands for a Flixbus city: Beauvais → Paris).

- **Under the route** (round trip only), a polite live line says what will happen: "🚌 Also compares Flixbus buses: Berlin → Budapest." or why not ("Flixbus doesn't go to Palma de Mallorca: flights only.", "Choose a destination airport, not a whole country, to compare with Flixbus."). The bus city names are shown because they can differ from the airport's.
- **Loading** adds ", by plane and by bus" to the detail when buses are compared.
- **Results** (`/search/trips`) are titled **Plane or bus?** when buses were found, else **Cheapest dates** as before:
  - columns: Dates, To, **✈ Ryanair**, **🚌 Flixbus**, **Better**; one row per week, cheapest first by the week's best option;
  - each side (`components/round-trip-cell/`): the total (and the **Cheapest** badge for the cheapest trip of the search), then each way: "07:50 → 09:20 · 1h 30m from Berlin Brandenburg" and, smaller, "FR 196 · €43.99" or "2 changes · via Dresden, Vienna · €34.46";
  - **Better:** "Bus cheaper by €10.41" / "Plane cheaper by €0.46" / "Same price", with "The plane is 14h 5m faster on the way out." below; "Only by plane" / "Only by bus" and "No flight" / "No bus" when a week has one side only;
  - the cheaper side of each week has a primary bar on its left (the Better column says it in words too);
  - above the table: "Ryanair is cheaper in 2 weeks, Flixbus in 7 weeks.", or the note on why buses weren't compared.
- **Times are local to each stop**, as on the ticket: read from the API's text (`clockTime`), never converted to the browser's zone. Flight durations use both airports' time zones.

The full requirements are in `docs/requirements.md`.

## 3. Choosing a trip

The trip is chosen **airport first**: From is an airport, and To is either an airport or "Any airport in {country}".

- `TripSelection` (`services/trip-selection.ts`) is the only state. The boxes, the destination list and the map all read and write it, and none of them keep their own copy.
- Changing From clears To.
- **To** is disabled until From is chosen and its routes have loaded. Its hint says why ("Choose where you fly from first.") or shows the count ("34 direct destinations").
- **To** only offers direct destinations: countries first ("Any airport in Spain"), then airports.
- **⇅ Swap** works only when To is a single airport. If there is no direct flight back, To is cleared.
- A destination that turns out not to be served (an old saved route, an edited link) is dropped once routes load. It is never shown as if it were valid.

### Several departure airports ("Also fly from")

For someone who lives between airports, e.g. a student in Aachen who can fly from Cologne, Weeze or Eindhoven.

- **When it appears:** once From and To are chosen, under the boxes (`components/trip-fields/`). It is optional.
- **Limit:** up to 3 departure airports in total (`MAX_ORIGINS`, the same limit as the API). At the limit, it says "You can fly from up to 3 airports."
- **Only airports that fly there:** it offers only airports with a direct flight to the destination (or to any airport in the destination country).
  - These come from the destination country's routes, which run both ways: one request, whatever the number of candidates.
  - While they load, a compact loader says "Finding airports that fly to {destination}…".
  - If there are none: "No other airport flies directly to {destination}."
- **Suggestions:** the 3 closest airports within 150 km (`NEARBY_KM`) of the first departure are one-click buttons, e.g. "+ Eindhoven 90 km". Their accessible name is "Add Eindhoven, 90 km away", since the "+" alone says nothing.
- **Any distance:** the "Add a departure airport" box lists every airport that flies there, closest first, with its distance ("90 km away · Netherlands · EIN").
- **Chips:** chosen extra departures show as chips (flag, name, distance) with a × to remove them.
- **Out and back:** the search flies out from any of them and back to any of them, whichever is cheapest. Out from Weeze and back to Cologne is allowed.

Rules:

- **The first airport is the main one.** From shows it, and the destination list, To options and map lines come from it.
- **Changing From starts over.** The destination and the extra departures are cleared.
- **Clearing To also removes the extra departures**, since they depend on the destination.
- **Changing To drops extra departures that don't fly to the new destination.**
- **Removing the first departure** (its chip, in saved routes or the URL) makes the next one the main departure; the destination stays.
- **⇅ Swap** is disabled with more than one departure airport.
- **Saved routes and the URL** keep every departure airport: "Cologne + Dusseldorf Weeze → Palma de Mallorca", `?from=CGN,NRN&to=PMI`.

### From/To boxes (`components/airport-search/`)

An outlined `mat-form-field` with a Material autocomplete, which provides the ARIA combobox pattern (`role="combobox"`, `aria-expanded`, `aria-activedescendant`, a `role="listbox"` popup in an overlay) and the keys. The first option is active as you type.

| Key or action      | Effect                                                  |
| ------------------ | ------------------------------------------------------- |
| Focus              | Selects the text and opens the list                     |
| Typing             | Filters the list                                        |
| ↓ / ↑              | Moves through the options                               |
| Enter              | Chooses the highlighted option                          |
| Escape             | Closes the list and shows the chosen value again        |
| ✕ (icon button)    | Clears the box (`aria-label="Clear From"`)              |

- **Matching** ignores case and accents, so "malaga" finds Málaga. It checks the name, city, code and country, ranked as: exact code, then names starting with the query, then words starting with it, then anywhere. It shows at most 50 results.
- **Display:** each option shows a flag, the airport name in bold, and "City · Country · CODE" below. The box shows the chosen name with its flag.
- A polite live region announces the number of results.

## 4. The map (`components/trip-map/`)

### Area

- Europe only: the shapes in `public/maps/europe.json` (generated by `scripts/build-map.mjs`) and a conic projection framed on Ryanair's airports. Don't add world data or tile maps.
- The map fills its parent. A `ResizeObserver` keeps the SVG `viewBox` equal to its size in pixels.

### Navigation

| Input                      | Effect                                 |
| -------------------------- | -------------------------------------- |
| Drag                       | Pan                                    |
| Scroll wheel, pinch        | Zoom around the pointer                |
| Double-click               | Zoom in                                |
| **+** / **−** buttons      | Zoom in or out by 1.5× around the centre |
| **⤢** button (Reset view)  | Back to the current trip, or to all of Europe |

- Zoom goes from 1× (all of Ryanair's network) to 16× (enough for Malta).
- Panning is limited to the map, so Europe can't be dragged off the screen.
- **Auto-fit:** whenever the trip changes, the map animates to fit it.
  - Nothing chosen: all airports.
  - From chosen: the airport and all its destinations.
  - To chosen: the two airports, or the departure airport plus the destination country's airports.
  - Between changes, the user is free to pan and zoom.
- With `prefers-reduced-motion`, zoom changes are instant.
- The zoom buttons sit before the map in Tab order, so keyboard users don't have to pass every airport to reach them. **−** is disabled at 1× and **+** at 16×.

### What is drawn

| State           | Airports                                                                 | Lines                                                    |
| --------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| Nothing chosen  | Every Ryanair airport is a clickable blue dot. Clicking sets **From**.   | None                                                     |
| Several departures | Every departure airport is primary and bold.                          | From each extra departure, one bold line to the chosen destination airport. For "any airport in a country" only the first departure has lines (where the others fly in that country isn't loaded). |
| From chosen     | The departure dot is primary and bold. Destinations are blue and clickable (clicking sets **To**). Other airports are grey, can't be chosen, and their tooltip says "No direct flight from X". | A thin great-circle line to every destination |
| To chosen       | The trip's dots are primary.                                             | The chosen line is bold with an arrow; the others fade (`--map-faded-opacity`) |
| Any airport in a country | Same, and that country is filled `--color-primary-subtle` with a primary border. | Lines to all its airports are bold          |

- **Countries** are background only and can't be clicked. Ryanair countries are sand (`--color-map-land`), others a paler grey (`--color-map-land-muted`), on a calm blue-grey sea. Possible flights are thin gold lines; the chosen one is night blue.
- **Country names** use the display serif in spaced capitals, like an old map.
- **Country names** are muted capitals, shown only when the country is big enough on screen.
- **Airport names** sit beside their dot (right, then left, above, below), wherever they don't overlap another name. Otherwise they are hidden but still shown on hover.
  - The trip's airports are placed first, so they always keep their names.
  - With nothing chosen, names appear only from 3× zoom.
  - Placement is recomputed when a zoom gesture ends, not on every frame.
- **Constant on-screen size:** dot radius, text and arrow sizes are divided by the zoom `k`. Strokes use `vector-effect: non-scaling-stroke` with the `--map-stroke*` tokens.
- **Legend** (bottom-left) matches the state: "Ryanair airport: click to fly from it" before From is chosen, then "Your trip / Direct flight / No direct flight", plus "Flixbus too" when some destination has a bus.
- **Flixbus too:** once From is chosen, destinations that Flixbus also reaches from the same city get a green ring (`--color-map-bus`) and "Also by bus" in their tooltip. The destination list in the sidebar tags them "🚌 Bus too" (direct bus) or "🚌 Bus with a change", after the country and code. Nothing else about buses is drawn: no bus lines or bus stops.

### Accessibility

- Every clickable dot is `role="button"` with `tabindex="0"` and an `aria-label` ("Name, City (CODE)"). Enter and Space choose it. Non-clickable dots have no role, but keep a `<title>` tooltip.
- Countries, lines and names are `aria-hidden`.
- Everything the map does can also be done from the sidebar (the boxes and the destination list).

## 5. Loading indicator (`components/loading-indicator/`)

Use it for every wait the user can notice, instead of plain "Loading…" text.

- **Inputs:** `title` (what is happening, e.g. "Finding the cheapest dates"), an optional `detail` (what exactly, and how long), and `compact`.
- **Full version** (searches, the map):
  - a card with a Material progress spinner, the title and the detail;
  - an indeterminate Material progress bar, in gold. The API gives no real progress, so it never fakes a percentage.
- **Compact version** (lists in the sidebar): one muted line with a small spinner, e.g. "Loading airports…" or "Loading direct flights…".
- It is a `role="status"` polite live region, so screen readers announce it.
- Material's spinner and bar follow `prefers-reduced-motion` themselves.

## 6. URL

`syncTripWithUrl()` (`services/trip-url.ts`) keeps the trip in the query params, on both pages:

- `/?from=CGN` (From only)
- `/?from=CGN&to=PMI` (airport to airport)
- `/search?from=OPO&to_country=ES` (any airport in Spain)
- `/?from=CGN,NRN&to=PMI` (several departure airports: comma-separated, the first is the main one)

On load the URL wins, once airports arrive. After that, every change replaces the URL (`replaceUrl`, so it doesn't add history entries). Reloading or sharing a link keeps the route. **Search prices** is just a link to `/search` with these params.

## 7. Saved routes

- **Save route** (star outline icon) appears once the trip is complete (on the route card and on the Search page) and toggles to **Saved** (filled star).
- Saved routes are kept in `localStorage` in this browser only; there are no accounts. Clicking a saved route makes it the current trip, and its ✕ icon button removes it. The current one is tinted gold.
- The result is announced in a polite live region: "… selected.", "… is no longer served by Ryanair." or "… removed from saved routes."
- **Always shown,** even with no saved routes: the heading, the hint "Save a route to find it here, or upload a routes file." and **↑ Upload file**.

### Routes file (download and upload)

To keep saved routes, or bring them to another browser or computer.

- **↓ Download file** (only with saved routes) saves `cheap-flights-routes.json`. The polite live region announces "N routes downloaded as cheap-flights-routes.json."
- **↑ Upload file** opens the browser's file dialog (`.json` only). It is disabled until the airports have loaded, since names are looked up from them.
- **The file holds only codes:** `{"app": "cheap-flights-europe", "version": 1, "routes": [{"origins": ["CGN", "NRN"], "destination": "PMI", "destinationCountry": "ES"}]}`. `destination: null` means any airport in `destinationCountry`. A bare list of routes is accepted too.
- **On upload:**
  - names come from today's airport list, not from the file;
  - for an airport destination, its country is taken from the airport;
  - codes may be lowercase, and repeated departures are merged;
  - new routes go after the saved ones, in the file's order; a route already saved is never added twice;
  - routes with unknown airports, a departure equal to the destination, more than 3 departures or a wrong shape are skipped, not fatal.
- **Outcome,** shown under the buttons and announced in the live region:
  - "Added 2 routes. 1 route was already saved. 1 route skipped: unknown airports, or ones Ryanair no longer flies from."
  - "No new routes. 2 routes were already saved."
  - "That file has no routes."
  - Shown in the error color when nothing could be used: "page.html isn't a routes file. Upload a file downloaded from Saved routes.", "big.json is too big to be a routes file." (over 1 MB, not read), or every route skipped.
- **Versions:** a file with a higher `version` than the app knows is refused as not a routes file. Bump `ROUTES_FILE_VERSION` when the shape of a file route changes.
- **Download file** and **Upload file** are outlined Material buttons with download/upload icons.

## 8. Tokens and layout constants

Added for these screens, in `src/styles.scss` (colors come from the Material theme defined there):

| Token                                  | Use                                                        |
| -------------------------------------- | ---------------------------------------------------------- |
| `--nav-height`, `--sidebar-width`      | Shell layout                                               |
| `--field-min-width`                    | Minimum width of form fields in a grid                     |
| `--map-height-mobile`, `--list-max-height-mobile` | Phone layout                                    |
| `--color-map-airport`, `--color-map-route` | Airport dots and possible flights (at least 3:1 on land) |
| `--color-map-bus`                      | Ring of destinations Flixbus also reaches (4.4:1 on land) |
| `--color-gold`, `--color-gold-subtle`, `--color-gold-on-primary` | Gold accents: taglines, highlights, the brand star and active tab |
| `--font-family-display`                | The serif for titles, the brand and country names          |
| `--map-stroke`, `--map-stroke-dot`, `--map-stroke-bold`, `--map-faded-opacity` | Map strokes, in on-screen pixels |
| `--radius-round`                       | Circles (swap button, legend dots)                         |
| `--focus-width`, `--focus-offset`, `--z-dropdown` | Focus ring, and the combobox popup layer        |
| `--line-height-label`, `--color-on-color-hover` | Label line height, and hover on the nav bar       |
| `--z-overlay`, `--color-overlay`       | The loading cover over a busy form                         |

- **Breakpoint:** one layout breakpoint, `768px`. Media queries can't read custom properties, so it is written literally.
- **Below 768px:**
  - The Routes page stacks (the sidebar, then a map `--map-height-mobile` tall), and the page scrolls.
  - The destination list scrolls on its own.
  - The Search page's From/To boxes stack.
  - The brand text gets smaller.
- **Exception:** sizes in the map's TypeScript (`DOT_RADIUS`, `LABEL_SIZE`, `FRAME_PADDING`, …) are SVG user units divided by the zoom, not CSS. They live as named constants in `trip-map.ts`.
