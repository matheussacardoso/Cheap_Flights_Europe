import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { geoConicConformal, geoPath } from 'd3-geo';
import { Selection, select } from 'd3-selection';
import 'd3-transition';
import { ZoomBehavior, ZoomTransform, zoom, zoomIdentity } from 'd3-zoom';
import { Airport } from '../../services/network';
import { CountryShape, MapDataService } from '../../services/map-data';
import { TripSelection, airportLabel } from '../../services/trip-selection';

/*
 * The SVG's viewBox matches the size of the map on screen, so before zooming one user unit is
 * one CSS pixel. Zooming scales the drawing by `k`: sizes that must stay the same on screen
 * (dots, text, arrows) are divided by `k`, and strokes use `vector-effect: non-scaling-stroke`.
 */
/** Used until the map is measured (and in tests, which have no ResizeObserver). */
const DEFAULT_SIZE = { width: 800, height: 600 };
const FRAME_PADDING = 32;
/** Share of the view kept as margin around the airports when zooming to them. */
const ZOOM_MARGIN = 0.15;
/** Deep enough for small countries such as Malta. */
const MAX_ZOOM = 16;
const ZOOM_STEP = 1.5;
const ZOOM_DURATION_MS = 400;
/** With no departure airport yet, airport names only show from this zoom (fewer dots overlap). */
const ALL_NAMES_ZOOM = 3;
/** Country names are hidden below this on-screen area, so small countries don't clutter. */
const MIN_LABEL_AREA = 2000;
const DOT_RADIUS = 5;
const LABEL_SIZE = 12;
/** On-screen gap between an airport dot and its name. */
const LABEL_GAP = 10;
/** Rough average glyph width relative to the font size, to estimate how wide a name is. */
const GLYPH_WIDTH = 0.6;

/**
 * - `available`: can be clicked (any airport before a departure is chosen, then destinations)
 * - `origin` / `destination`: part of the chosen trip
 * - `unavailable`: no direct flight from the chosen departure airport
 */
type AirportStatus = 'origin' | 'destination' | 'available' | 'unavailable';
/** Where an airport's name sits relative to its dot, in order of preference. */
const NAME_PLACEMENTS = ['right', 'left', 'above', 'below'] as const;
type NamePlacement = (typeof NAME_PLACEMENTS)[number];

interface MapCountry {
  code: string | null;
  /** Ryanair's name for the country; null for countries Ryanair doesn't serve. */
  name: string | null;
  d: string;
  labelX: number;
  labelY: number;
  area: number;
  status: 'served' | 'outside' | 'destination';
}

interface MapAirport {
  code: string;
  /** "Name, City (CODE)", for tooltips and screen readers. */
  label: string;
  /** Short name drawn next to the dot. */
  name: string;
  x: number;
  y: number;
  /** Where the name goes, or null when there is no room (it still shows on hover). */
  namePlacement: NamePlacement | null;
  status: AirportStatus;
  selectable: boolean;
  note: string;
}

interface Flight {
  code: string;
  d: string;
  /** Part of the chosen trip (drawn bold with an arrow); otherwise a possible flight. */
  chosen: boolean;
}

interface Zoomer {
  behavior: ZoomBehavior<SVGSVGElement, unknown>;
  svg: Selection<SVGSVGElement, unknown, null, undefined>;
}

/**
 * Full-size map of Ryanair's network: drag to pan, scroll or pinch to zoom. It reads and writes
 * the shared `TripSelection` store: click any airport to fly from it, then one of its direct
 * destinations. The map zooms to the trip whenever it changes.
 */
@Component({
  selector: 'app-trip-map',
  standalone: true,
  templateUrl: './trip-map.html',
  styleUrl: './trip-map.css',
})
export class TripMapComponent implements OnInit {
  readonly trip = inject(TripSelection);
  private mapData = inject(MapDataService);
  private destroyRef = inject(DestroyRef);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private svgRef = viewChild<ElementRef<SVGSVGElement>>('svg');

  readonly shapes = signal<CountryShape[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly size = signal(DEFAULT_SIZE);
  readonly viewBox = computed(() => `0 0 ${this.size().width} ${this.size().height}`);

  /** The current pan and zoom. */
  readonly transform = signal<ZoomTransform>(zoomIdentity);
  /** Zoom when the last gesture ended: names are placed for it (not on every frame). */
  private readonly settledZoom = signal(1);
  private readonly zoomer = signal<Zoomer | null>(null);

  readonly zoom = computed(() => this.transform().k);
  readonly dotRadius = computed(() => DOT_RADIUS / this.zoom());
  readonly labelSize = computed(() => LABEL_SIZE / this.zoom());
  readonly arrowSize = computed(() => 10 / this.zoom());
  readonly canZoomIn = computed(() => this.zoom() < MAX_ZOOM);
  readonly canZoomOut = computed(() => this.zoom() > 1);

  /** Conic projection framed on Ryanair's airports (Canary Islands to Lapland, Azores to Jordan). */
  private readonly projection = computed(() => {
    const { width, height } = this.size();
    const projection = geoConicConformal().rotate([-10, 0]).parallels([35, 60]);
    const points = this.trip.airports().map((a) => [a.longitude, a.latitude]);
    if (points.length > 1) {
      projection.fitExtent(
        [
          [FRAME_PADDING, FRAME_PADDING],
          [width - FRAME_PADDING, height - FRAME_PADDING],
        ],
        { type: 'MultiPoint', coordinates: points },
      );
    }
    return projection;
  });

  private readonly path = computed(() => geoPath(this.projection()));

  readonly countries = computed<MapCountry[]>(() => {
    const path = this.path();
    const projection = this.projection();
    const names = new Map(this.trip.countries().map((c) => [c.code, c.name]));
    const destination =
      this.trip.destinationCountry() ?? this.trip.destinationAirport()?.countryCode ?? null;
    return this.shapes().map((shape) => {
      const code = shape.properties.code;
      const name = (code && names.get(code)) ?? null;
      const [labelX, labelY] = projection(shape.properties.label) ?? [NaN, NaN];
      return {
        code,
        name,
        d: path(shape) ?? '',
        labelX,
        labelY,
        area: path.area(shape),
        status: !name ? 'outside' : code === destination ? 'destination' : 'served',
      };
    });
  });

  readonly airports = computed<MapAirport[]>(() => {
    const projection = this.projection();
    const origin = this.trip.origin();
    const reachable = this.trip.destinationCodes();
    const destination = this.trip.destination();
    const destinationCountry = this.trip.destinationCountry();
    const routesKnown = !this.trip.loadingRoutes();
    const originName = this.trip.originAirport()?.name ?? '';

    const dots = this.trip.airports().map((airport): MapAirport => {
      let status: AirportStatus = 'available';
      let note = '';
      if (origin) {
        const chosen =
          airport.code === destination ||
          (airport.countryCode === destinationCountry && reachable.has(airport.code));
        if (airport.code === origin) {
          status = 'origin';
          note = 'Departure airport';
        } else if (chosen) {
          status = 'destination';
        } else if (!reachable.has(airport.code)) {
          status = 'unavailable';
          note = routesKnown ? `No direct flight from ${originName}` : '';
        }
      }
      const [x, y] = projection([airport.longitude, airport.latitude]) ?? [NaN, NaN];
      return {
        code: airport.code,
        label: airportLabel(airport),
        name: airport.name,
        x,
        y,
        namePlacement: null,
        status,
        selectable: status === 'available' || status === 'destination',
        note,
      };
    });

    const zoom = this.settledZoom();
    placeNames(
      dots.filter((dot) => dot.status !== 'unavailable' && (origin || zoom >= ALL_NAMES_ZOOM)),
      zoom,
    );
    // Draw the trip and the selectable dots last so they sit on top, in name order for Tab.
    const layer = { unavailable: 0, available: 1, destination: 2, origin: 3 };
    return dots.sort((a, b) => layer[a.status] - layer[b.status] || a.label.localeCompare(b.label));
  });

  /** Great-circle lines from the departure airport to its direct destinations. */
  readonly flights = computed<Flight[]>(() => {
    const origin = this.trip.originAirport();
    if (!origin) {
      return [];
    }
    const destination = this.trip.destination();
    const country = this.trip.destinationCountry();
    const path = this.path();
    return (
      this.trip
        .destinations()
        .map((airport) => ({
          code: airport.code,
          chosen: airport.code === destination || airport.countryCode === country,
          d:
            path({
              type: 'LineString',
              coordinates: [
                [origin.longitude, origin.latitude],
                [airport.longitude, airport.latitude],
              ],
            }) ?? '',
        }))
        // Chosen flights last, on top.
        .sort((a, b) => Number(a.chosen) - Number(b.chosen))
    );
  });

  readonly hasChosenFlight = computed(() => this.flights().some((flight) => flight.chosen));

  /** What the map zooms to: the trip, the departure airport's network, or everything. */
  private readonly focusPoints = computed<[number, number][]>(() => {
    const origin = this.trip.originAirport();
    let airports: Airport[] = [];
    if (origin) {
      const destination = this.trip.destinationAirport();
      const country = this.trip.destinationCountry();
      const destinations = this.trip.destinations();
      const chosen = destination
        ? [destination]
        : destinations.filter((airport) => airport.countryCode === country);
      airports = [origin, ...(chosen.length ? chosen : destinations)];
    }
    const projection = this.projection();
    return airports
      .map((a) => projection([a.longitude, a.latitude]))
      .filter((point): point is [number, number] => !!point);
  });

  constructor() {
    // Attach pan and zoom once the SVG exists; re-attach when its size changes.
    effect((onCleanup) => {
      const element = this.svgRef()?.nativeElement;
      const { width, height } = this.size();
      if (!element) {
        return;
      }
      const behavior = zoom<SVGSVGElement, unknown>()
        .scaleExtent([1, MAX_ZOOM])
        .extent([
          [0, 0],
          [width, height],
        ])
        .translateExtent([
          [0, 0],
          [width, height],
        ])
        .on('zoom', (event: { transform: ZoomTransform }) => this.transform.set(event.transform))
        .on('end', (event: { transform: ZoomTransform }) =>
          this.settledZoom.set(event.transform.k),
        );
      const svg = select(element);
      svg.call(behavior);
      this.zoomer.set({ behavior, svg });
      onCleanup(() => svg.on('.zoom', null));
    });

    // Zoom to the trip whenever it changes. The user can pan away freely in between.
    effect(() => {
      const points = this.focusPoints();
      const zoomer = this.zoomer();
      if (zoomer) {
        untracked(() => this.zoomTo(zoomer, this.fitTransform(points)));
      }
    });
  }

  ngOnInit(): void {
    this.load();
    this.observeSize();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.mapData
      .getCountryShapes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (collection) => {
          this.shapes.set(collection.features);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Could not load the map. Use the list of destinations, or try again.');
          this.loading.set(false);
        },
      });
  }

  zoomIn(): void {
    this.zoomBy(ZOOM_STEP);
  }

  zoomOut(): void {
    this.zoomBy(1 / ZOOM_STEP);
  }

  /** Back to the trip, or to the whole network when nothing is chosen. */
  resetView(): void {
    const zoomer = this.zoomer();
    if (zoomer) {
      this.zoomTo(zoomer, this.fitTransform(this.focusPoints()));
    }
  }

  showLabel(country: MapCountry): boolean {
    return !!country.name && country.area * this.zoom() ** 2 >= MIN_LABEL_AREA;
  }

  /** Position of the airport's name, on the side of the dot chosen by `placeNames`. */
  nameX(airport: MapAirport): number {
    const offset = (DOT_RADIUS + LABEL_GAP / 2) / this.zoom();
    switch (airport.namePlacement) {
      case 'right':
        return airport.x + offset;
      case 'left':
        return airport.x - offset;
      default:
        return airport.x;
    }
  }

  nameY(airport: MapAirport): number {
    const offset = (DOT_RADIUS + LABEL_GAP / 2) / this.zoom();
    switch (airport.namePlacement) {
      case 'above':
        return airport.y - offset;
      case 'below':
        return airport.y + offset + this.labelSize() * 0.8;
      default:
        return airport.y + this.labelSize() / 3;
    }
  }

  nameAnchor(airport: MapAirport): string {
    switch (airport.namePlacement) {
      case 'right':
        return 'start';
      case 'left':
        return 'end';
      default:
        return 'middle';
    }
  }

  airportTitle(airport: MapAirport): string {
    return airport.note ? `${airport.label}: ${airport.note}` : airport.label;
  }

  select(airport: MapAirport, event?: Event): void {
    event?.preventDefault();
    if (!airport.selectable) {
      return;
    }
    if (this.trip.origin()) {
      this.trip.selectDestination(airport.code);
    } else {
      this.trip.selectOrigin(airport.code);
    }
  }

  private zoomBy(factor: number): void {
    const zoomer = this.zoomer();
    if (!zoomer) {
      return;
    }
    if (canAnimate()) {
      zoomer.svg.transition().duration(ZOOM_DURATION_MS).call(zoomer.behavior.scaleBy, factor);
    } else {
      zoomer.svg.call(zoomer.behavior.scaleBy, factor);
    }
  }

  private zoomTo(zoomer: Zoomer, transform: ZoomTransform): void {
    if (canAnimate()) {
      zoomer.svg.transition().duration(ZOOM_DURATION_MS).call(zoomer.behavior.transform, transform);
    } else {
      zoomer.svg.call(zoomer.behavior.transform, transform);
    }
  }

  /** The closest view (with a margin and a zoom limit) that shows all the points. */
  private fitTransform(points: [number, number][]): ZoomTransform {
    if (!points.length) {
      return zoomIdentity;
    }
    const { width, height } = this.size();
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const [minX, maxX, minY, maxY] = [
      Math.min(...xs),
      Math.max(...xs),
      Math.min(...ys),
      Math.max(...ys),
    ];
    const room = 1 - 2 * ZOOM_MARGIN;
    const k = clamp(
      Math.min((width * room) / (maxX - minX || 1), (height * room) / (maxY - minY || 1)),
      1,
      MAX_ZOOM,
    );
    // translateExtent then keeps the view inside the map.
    return zoomIdentity
      .translate(width / 2, height / 2)
      .scale(k)
      .translate(-(minX + maxX) / 2, -(minY + maxY) / 2);
  }

  private observeSize(): void {
    if (typeof ResizeObserver !== 'function') {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        this.size.set({ width: Math.round(width), height: Math.round(height) });
      }
    });
    observer.observe(this.host.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}

/**
 * Puts each airport's name beside its dot: right, left, above or below, whichever is the first that
 * doesn't overlap a name already placed. With no room anywhere the name is hidden (it still shows
 * on hover). The trip's airports are placed first so they keep their names. Works in on-screen
 * units at the given zoom.
 */
function placeNames(dots: MapAirport[], zoom: number): void {
  const placed: { left: number; right: number; top: number; bottom: number }[] = [];
  const priority: Record<AirportStatus, number> = {
    origin: 0,
    destination: 0,
    available: 1,
    unavailable: 2,
  };
  const ordered = [...dots].sort((a, b) => priority[a.status] - priority[b.status]);
  for (const dot of ordered) {
    const x = dot.x * zoom;
    const y = dot.y * zoom;
    const width = dot.name.length * LABEL_SIZE * GLYPH_WIDTH;
    const offset = DOT_RADIUS + LABEL_GAP / 2;
    const beside = { top: y - LABEL_SIZE, bottom: y + LABEL_SIZE / 2 };
    const centred = { left: x - width / 2, right: x + width / 2 };
    const boxes: Record<
      NamePlacement,
      { left: number; right: number; top: number; bottom: number }
    > = {
      right: { left: x + offset, right: x + offset + width, ...beside },
      left: { left: x - offset - width, right: x - offset, ...beside },
      above: { top: y - offset - LABEL_SIZE, bottom: y - offset, ...centred },
      below: { top: y + offset, bottom: y + offset + LABEL_SIZE, ...centred },
    };
    for (const side of NAME_PLACEMENTS) {
      const box = boxes[side];
      const overlaps = placed.some(
        (other) =>
          box.left < other.right &&
          box.right > other.left &&
          box.top < other.bottom &&
          box.bottom > other.top,
      );
      if (!overlaps) {
        dot.namePlacement = side;
        placed.push(box);
        break;
      }
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** No animation in tests (jsdom has no matchMedia) or when the user prefers less motion. */
function canAnimate(): boolean {
  return (
    typeof requestAnimationFrame === 'function' &&
    typeof matchMedia === 'function' &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
