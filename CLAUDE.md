# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Finds cheap, direct, low-cost flights in Europe for long-weekend trips. The root `README.md` describes the product vision: multi-airline search, Thu–Mon and Fri–Tue presets, time windows and price caps. **None of that is built yet.** Today the app only searches Ryanair's cheapest flights through `ryanair-py`.

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
npx ng test --include src/app/services/flight.spec.ts   # single spec file
npx prettier --write src                      # formatting (.prettierrc)
```

## Architecture

### Backend layering

`api/routes → api/dependencies → services → external SDKs/APIs`, with `schemas` and `core` shared across layers. New features follow the same shape: a router in `api/routes/` (registered in `main.py`), request/response models in `schemas/`, business logic and third-party calls in a service in `services/`, and wiring in `api/dependencies.py`.

- `app/main.py`: the `create_app(settings)` factory. It sets up logging, middleware, CORS, exception handlers, routers and the `lifespan`.
- `app/core/`: cross-cutting code. `config.py` holds `Settings`, `logging.py` + `middleware.py` handle structured logs with a per-request `request_id`, and `exceptions.py` holds domain exceptions plus the handlers that map them to HTTP responses.
- Routes stay thin. They don't catch exceptions or talk to SDKs directly. Services raise domain exceptions, and the handlers in `core/exceptions.py` turn them into HTTP responses.

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
- The frontend currently hardcodes the API base URL (`http://127.0.0.1:8000`). The backend's `CORS_ORIGINS` setting must include the frontend's origin.

### Frontend

- Angular standalone components (no NgModules). Each feature is a component folder in `src/app/components/`, HTTP calls live in services in `src/app/services/`, and routes are registered in `app.routes.ts`.
- The app is **zoneless** (`provideZonelessChangeDetection()`), so UI updates must come from signals or template events, not zone.js-triggered change detection.
- Data passed between pages currently lives in memory on the services, so it is lost when the page reloads.
- The app is in English: all user-facing text, code comments and `<html lang="en">`.

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
- Frontend specs live next to the code they test (`*.spec.ts`) and run on Vitest.
