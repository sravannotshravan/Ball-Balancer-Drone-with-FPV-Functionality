# Ball Balancer Drone with FPV Functionality

A browser-based drone simulation with a front-mounted camera, tray-ball balancing, assist mode, and mobile stereo FPV view.

## Features

- Drone flight simulation with keyboard and gamepad support
- Ball-in-tray physics and centering assist
- Desktop HUD with telemetry and controls
- Mobile front-camera view
- Stereo VR-style split view on mobile with double-tap / double-click toggle
- City and mountain plains environments

## Tutorial

Open [tutorial.html](tutorial.html) for a full documentation page with a live interface preview and UI highlights. You can print that page to PDF from your browser to capture the tutorial layout.

## Requirements

- Node.js 18 or newer

## Run locally

### Windows

```bat
start-server.bat
```

### macOS or Linux

```bash
sh run-local.sh
```

If you prefer to run it manually:

```bash
npm install
npm start
```

Then open:

- Desktop view: http://localhost:4173/
- Mobile view: http://localhost:4173/mobile.html

## Run with the Dockerfile

The `Dockerfile` starts `server.js`, listens on port `4173`, and serves the app at `localhost:4173` in your browser.

Build the image from the `Dockerfile`:

```bash
docker build -t drones-project-gemini -f Dockerfile .
```

Run the container:

```bash
docker run --rm -p 4173:4173 --name drones-project-gemini drones-project-gemini
```

Then open:

- Desktop view: http://localhost:4173/
- Mobile view: http://localhost:4173/mobile.html

## Run with Docker Compose (recommended)

```bash
docker compose up --build
```

This uses `docker-compose.yml` and automatically sets:

- Port mapping `4173:4173`
- `HOST=0.0.0.0` inside the container
- `PORT=4173`

Stop with:

```bash
docker compose down
```

## Helper scripts

### Windows

```bat
run-docker.bat
```

### macOS or Linux

```bash
sh run.sh
```

If you want to execute it directly:

```bash
chmod +x run.sh
./run.sh
```

These scripts build the Docker image and start the app on http://localhost:4173/.

## Run from Docker Desktop UI

Use **Containers** or **Compose** with `docker-compose.yml` instead of running the image directly. This avoids missing port mappings in the UI run dialog.

## Controls

### Keyboard

- W / A / S / D: Move drone
- Arrow keys: Pitch / roll
- B: Toggle auto-balance
- G: Toggle assisted mode
- T: Toggle environment
- F3: Toggle debug HUD

### Gamepad

- Left stick: Altitude and yaw
- Right stick: Pitch and roll
- Y: Toggle assisted mode
- X: Toggle environment
- B: Toggle auto-balance

## Mobile VR view

On mobile, double-tap or double-click the screen to switch the front-camera view into stereo VR mode.

## Files

- [main.js](main.js) — simulation, rendering, HUD, and mobile stereo view
- [drone.js](drone.js) — drone model setup
- [input.js](input.js) — keyboard and gamepad input handling
- [server.js](server.js) — local static file server
- [style.css](style.css) — UI and stereo layout styling
- [index.html](index.html) — desktop entry page
- [mobile.html](mobile.html) — mobile entry page

## License

No license has been specified yet.
