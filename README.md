# Ball Balancer Drone with Autonomous Navigation

A browser-based drone simulation where you fly a tray-carrying drone while keeping a physics-driven ball centered in the tray. The project includes manual flight, assisted balancing, autonomous path tracing, a minimap, and a mobile FPV view.

## Features

- Keyboard and gamepad drone flight controls
- Physics-based ball-on-tray simulation
- Assisted ball-centering and tray-stabilization logic
- Autonomous waypoint navigation with A* pathfinding
- Destination setting by:
  - entering world coordinates
  - clicking the minimap
  - clicking directly in the 3D world
- 3D destination marker and route visualization
- Desktop HUD with telemetry, minimap, and control hints
- City and mountain-plains generated environments
- Mobile front-camera view
- Stereo VR-style split FPV mode on mobile

## Requirements

- Node.js 18 or newer

## Run locally

```bash
npm install
npm start
```

Then open:

- Desktop view: `http://localhost:4173/`
- Mobile view: `http://localhost:4173/mobile.html`

## Controls

### Keyboard

- `W` / `S`: Altitude up / down
- `A` / `D`: Yaw left / right
- Arrow keys: Pitch / roll
- `B`: Toggle auto-balance
- `G`: Toggle assisted mode
- `L`: Toggle autonomous mode
- `N`: Open destination modal
- `M`: Arm or cancel world-click destination picking
- `T`: Toggle environment
- `Esc`: Cancel destination modal or world-pick mode
- `F3`: Toggle debug HUD

### Gamepad

- Left stick: Altitude and yaw
- Right stick: Pitch and roll
- `Y`: Toggle assisted mode
- `X`: Toggle environment
- `B`: Toggle auto-balance
- `LB`: Toggle autonomous mode
- `RB`: Open destination UI

## Autonomous Navigation

Autonomous mode follows planned routes through the generated world while still using the same movement model as manual flight:

- the drone turns using yaw
- the drone advances by pitching forward
- the route planner avoids marked obstacles using the navigation grid
- pilot input blends back in as an override

You can set a destination in three ways:

1. Click `Set Destination` and enter `X` / `Z` world coordinates.
2. Click the minimap to place a destination relative to the drone.
3. Click `Pick In World`, then click directly on the 3D world to place the destination marker.

## Mobile FPV View

Open `mobile.html` on a phone or secondary screen for the front-camera feed. Double-tap or double-click the screen to switch into stereo VR-style FPV mode.

## Project Files

- [main.js](main.js): simulation loop, physics coordination, HUD, autonomy integration, world picking, and rendering
- [autonomy.js](autonomy.js): autonomous destination handling and waypoint-following logic
- [pathfinding.js](pathfinding.js): navigation grid, obstacle marking, and A* pathfinding
- [drone.js](drone.js): drone mesh/model setup
- [input.js](input.js): keyboard and gamepad input handling
- [style.css](style.css): HUD, modal, minimap, and mobile FPV styling
- [index.html](index.html): desktop entry page
- [mobile.html](mobile.html): mobile front-camera page
- [server.js](server.js): local static server

## License

No license has been specified yet.
