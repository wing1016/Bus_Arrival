# Vibe Bus Arrival

Responsive Hong Kong bus arrival web app.

The app uses:
- Bus route input (for example: 8, 88, 8P)
- User GPS location (device detection or map selection)
- Nearest stop matching for the selected route
- Live ETA lookup and display of next 3 arrivals
- Automatic operator resolution (KMB first, Citybus fallback)

## Architecture

```text
┌───────────────────────────────────────┐
│ Browser                               │
│ React + Vite                          │
│ - Bus Number Input                    │
│ - GPS (Device or Map Popup)           │
└──────────────────┬────────────────────┘
				   │ HTTP /api/bus-arrivals
				   ▼
┌───────────────────────────────────────┐
│ Gateway (Node.js / Express)           │
│ - JWT Authentication middleware        │
│ - Route + GPS validation               │
│ - Nearest stop calculation             │
│ - KMB first, Citybus fallback          │
└──────────────┬────────────────────────┘
			   │ HTTPS APIs
	┌──────────┴──────────┐
	▼                     ▼
┌──────────────────┐   ┌──────────────────┐
│ KMB Open Data    │   │ Citybus Open Data│
│ - Route/Stop data│   │ - Route/Stop data│
│ - ETA data       │   │ - ETA data       │
└──────────────────┘   └──────────────────┘

┌───────────────────────────────────────┐
│ Intelligence (Python / FastAPI)       │
│ - Scaffolded for future enhancements  │
└───────────────────────────────────────┘
```

## Project Structure

```text
vibe_bus_arrival/
├── .github/
│   └── copilot-instructions.md
└── main/
	├── backend/
	│   ├── server.js
	│   ├── package.json
	│   ├── requirements.txt
	│   └── .env
	├── frontend/
	│   ├── src/
	│   │   ├── App.jsx
	│   │   ├── main.jsx
	│   │   └── index.css
	│   ├── index.html
	│   ├── vite.config.js
	│   └── package.json
	├── intelligence/
	│   ├── app.py
	│   └── requirements.txt
	├── instruction.txt
	├── README.md
	└── package.json
```

## Start The Application

Open two terminals from the workspace root.

### 1. Start backend

```powershell
cd main\backend
node server.js
```

### 2. Start frontend

```powershell
cd main\frontend
npm run dev
```

Then open the URL shown in the Vite terminal output.

Note:
- Usually it is http://localhost:5173
- If 5173 is occupied, Vite will use another port (for example 5174)

## How To Use

1. Enter a Hong Kong route number (examples: 8, 88, 8P).
2. Set your location using one of these options:
	- Use Device Location
	- Open Map, click a location in the popup window (popup closes automatically)
3. Click Search.
4. Review:
	- nearest matched stop
	- distance to that stop
	- next 3 upcoming arrival times in AM/PM format

## Validation And Errors

- Invalid route format shows a friendly message.
- Missing GPS location shows a friendly message.
- Route not found or no upcoming ETA shows an API-backed message.

## Production Build

```powershell
cd main\frontend
npm run build
```
