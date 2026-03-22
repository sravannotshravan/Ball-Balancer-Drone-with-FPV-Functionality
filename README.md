# Drones Project Gemini

A browser-based drone simulation with a front-mounted camera, tray-ball balancing, assist mode, and mobile stereo FPV view.

## Features

- Drone flight simulation with keyboard and gamepad support
- Ball-in-tray physics and centering assist
- Desktop HUD with telemetry and controls
- Mobile front-camera view
- Stereo VR-style split view on mobile with double-tap / double-click toggle
- City and mountain plains environments

## Requirements

- Node.js 18 or newer

## Run locally

```bash
npm install
npm start
```

Then open:

- Desktop view: http://localhost:4173/
- Mobile view: http://localhost:4173/mobile.html

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
