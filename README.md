# Fuel Optimizer

A full-stack web application designed for intelligent road trip planning and fuel cost minimization across Europe. The system calculates the cheapest refueling strategy along a driving route by combining road geometry, vehicle constraints (consumption, tank capacity, initial fuel level), and real-time gas station prices.

Originally developed as a university coursework project and hosted on Cherry Servers infrastructure provided by the university. This repository is a consolidated monorepo combining previously separated micro-repositories (`fuel-optimizer-ui`, `fuel-optimizer-api`, and `fuel-optimizer-pdf`), which have been archived.

---

## Architecture Overview

The system is organized into three primary layers:

1. **Frontend (React + Vite + TypeScript):** Interactive SPA featuring route configuration forms, vehicle spec controls, and route/waypoint visualization using Leaflet.
2. **Backend API (.NET 8 ASP.NET Core):** Handles geocoding, route calculation, geometric station projection, and the fuel optimization algorithm.
3. **Serverless PDF Export (AWS Lambda via Vercel Functions):** A dedicated serverless function (`/api/report`) running on Node.js using `jsPDF` to generate on-demand, downloadable PDF trip dossiers. Deploying this logic as a serverless Lambda through Vercel offloads heavy document rendering from both client and core API.

```
fuel-optimizer/
├── frontend/             # React SPA + Vercel Serverless Functions
│   ├── src/              # UI components, state management, Leaflet map
│   ├── api/              # Serverless PDF generator (/api/report)
│   ├── Dockerfile        # Production container with Nginx
│   └── vercel.json       # Vercel deployment configuration
├── backend/              # ASP.NET Core 8 Web API
│   ├── Controllers/      # Trip calculation & price endpoints
│   ├── Services/         # Routing, Tankerkoenig client, Greedy Optimizer
│   ├── Models/           # DTOs & SQLite entities
│   └── Dockerfile        # .NET 8 runtime container
├── docker-compose.yml    # Local multi-container orchestration
└── .env.example          # Environment variables template
```

---

## Real-World Constraints & API Workarounds

Integrating public road and fuel APIs for long-distance European trips revealed several critical API limitations, requiring custom algorithmic fallbacks and geometric workarounds:

### 1. Geographic Limitation of Fuel Data (Tankerkönig API)
- **Problem:** Real-time fuel price APIs like Tankerkönig only cover Germany. For cross-border trips (e.g. Poland to France or the Baltics), an API query outside Germany fails or returns no data.
- **Workaround:** Implemented a bounding-box pre-check (`lat: 47.2–55.1`, `lng: 5.8–15.2`). When routes transit through Germany, waypoints are sampled every 45 km to query stations in bulk within a 25 km radius. Outside Germany, the backend smoothly degrades to a dynamic price simulation model calibrated against average European regional fuel rates.

### 2. Point-in-Polygon & Distance Along Route (Station Projection)
- **Problem:** External POI endpoints return raw latitude/longitude coordinates of nearby gas stations, but they do not know *at which kilometer of the trip* the driver encounters the station. Without an ordered distance index, the greedy optimization algorithm cannot calculate reachable fuel ranges.
- **Workaround:** Implemented an on-the-fly projection algorithm (`ProjectOntoRoute`). For every retrieved gas station, the backend calculates the minimum Haversine distance to the nearest segment of the route polyline and maps it against a precomputed cumulative distance array. This gives each station an accurate `DistanceAlongRouteKm`.

### 3. OpenRouteService Rate Limits & Timeouts on Long Corridors
- **Problem:** Requesting POIs with huge buffer geometries along 1000+ km routes frequently triggered timeouts or payload limits on free API tiers.
- **Workaround:** The backend implements a fallback generator (`GenerateSimulatedStations`) that synthesizes candidate stops at 50 km intervals directly along the route geometry if the external POI provider fails, and still cross-references real Tankerkönig prices whenever the station happens to be in coverage.

### 4. Electric Vehicles (EV) Handling
- **Problem:** Fuel price APIs do not index public EV charging networks, and mixing fuel units (liters vs. kWh) breaks standard cost models.
- **Workaround:** Electric vehicles bypass fossil fuel API calls entirely; the pipeline switches units to kWh, calculates charging intervals based on battery capacity, and applies regional electricity tariff models.

---

## Optimization Algorithm

The core planner in `OptimizationService.cs` uses a greedy lookahead strategy:
1. Calculates current remaining range: `(currentFuel - safetyBuffer) / consumptionPerKm`.
2. Identifies all reachable stations before the fuel runs out.
3. Selects the cheapest station in the reachable window.
4. Calculates the exact amount to refuel: fills only what is necessary to reach the next cheaper stop or the destination, preventing expensive over-refueling.

---

## Live Demo & Deployment

- **Interactive Cloud Demo:** The frontend on Vercel includes a built-in **Interactive Demo Mode** featuring pre-computed European routes (e.g., Berlin ➔ Munich for Petrol, Frankfurt ➔ Amsterdam for Diesel, Vienna ➔ Salzburg for EV). It allows immediate testing of interactive route polylines, station popups, and live serverless PDF generation without requiring a local backend or external API tokens.

### Production (Cherry Servers ➔ Vercel)
- Originally hosted during university development on a **Cherry Servers cloud instance** running Docker containers for both .NET API and Nginx-served UI.
- Currently configured for seamless zero-server deployment:
  - **Frontend + PDF Lambda:** Deployed to **Vercel** (`vercel.json`), with the PDF generator running as a serverless AWS Lambda function behind Vercel's edge network.
  - **Backend API:** Containerized via `backend/Dockerfile` for deployment to any container platform (Railway, Render, VPS).

### Running Locally (Docker Compose)

1. Clone the repository:
   ```bash
   git clone https://github.com/IssueRace/Fuel_Optimizer.git
   cd Fuel_Optimizer
   ```

2. Configure environment keys:
   ```bash
   cp .env.example .env
   ```
   Add your keys for:
   - `OPENROUTESERVICE_API_KEY` ([openrouteservice.org](https://openrouteservice.org/))
   - `TANKERKOENIG_API_KEY` ([creativecommons.tankerkoenig.de](https://creativecommons.tankerkoenig.de/))

3. Build and launch containers:
   ```bash
   docker compose up --build -d
   ```
   - Frontend runs on: `http://localhost:80`
   - Backend API runs on: `http://localhost:5000`

---

## Repository History

This repository consolidates code originally split across three separate repositories during initial university development:
- `fuel-optimizer-ui` (React single-page application)
- `fuel-optimizer-api` (C# ASP.NET Core backend)
- `fuel-optimizer-pdf` (jsPDF serverless script, now merged directly into `frontend/api/report.ts`)

These individual repos have been unified into this monorepo to simplify build orchestration and deployment maintenance.
