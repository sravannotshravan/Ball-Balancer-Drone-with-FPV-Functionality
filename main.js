import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createDrone } from './drone.js';
import { activeInputSource, input, updateInput } from './input.js';

const FIXED_TIME_STEP = 1 / 60;
const MOVE_SPEED = 2.1;
const TILT_LIMIT = 0.26;
const DRONE_HEIGHT = 2;
const TRAY_OFFSET_Y = 0.22;
const YAW_SPEED = 0.7;
const VERTICAL_SPEED = 0.9;
const MIN_ALTITUDE = 0.8;
const MAX_ALTITUDE = 8.5;
const MAX_VERTICAL_STEP = 0.02;
const STICK_NEUTRAL_THRESHOLD = 0.08;
const ATTITUDE_RETURN_LERP = 0.18;
const PITCH_ROLL_MOVE_GAIN = 0.6;
const EDGE_CONTACT_TOLERANCE = 0.006;
const OUT_OF_TRAY_GRACE_TIME = 0.18;
const CAMERA_LERP = 0.08;
const MOVE_LERP = 0.05;
const TILT_LERP = 0.05;
const ASSIST_STABILIZE_P = 1.0;
const ASSIST_STABILIZE_D = 0.5;
const ASSIST_INTENT_GAIN = 0.04;
const ASSIST_STICK_BLEND = 0.16;
const ASSIST_CENTER_VEL_DEADBAND = 0.14;
const ASSIST_MICRO_TILT = 0.015;
const ASSIST_VEL_MICRO_GAIN = 0.06;
const ASSIST_CENTER_TRANSLATION_P = 0.55;
const ASSIST_CENTER_TRANSLATION_D = 0.28;
const ASSIST_CENTER_TRANSLATION_MAX = 0.35;
const ASSIST_INPUT_NEUTRAL = 0.08;
const ASSIST_CENTER_HOLD_VEL = 0.18;
const ASSIST_STOP_DAMPING = 0.34;
const CENTER_REGION_RATIO_DEFAULT = 0.22;
const CENTER_REGION_RATIO_MIN = 0.12;
const CENTER_REGION_RATIO_MAX = 0.45;
const CENTER_REGION_MIN = 0.04;
const CENTER_REGION_MAX = 0.12;
const CENTER_HOLD_EXIT_SCALE = 1.35;
const CENTER_HOLD_DAMPING = 0.45;
const CENTER_HOLD_TRANSLATION_DAMPING = 0.62;
const CENTER_HOLD_TRANSLATION_SNAP = 0.02;
const ASSIST_DIRECTION_STEP_MAX = 0.06;
const ASSIST_TILT_STEP_MAX = 0.01;
const ATTITUDE_RATE_LIMIT = 0.7;
const EDGE_RESCUE_START = 0.72;
const EDGE_RESCUE_MAX_TILT = 0.14;
const EDGE_STUCK_SPEED = 0.09;
const EDGE_UNSTICK_NUDGE = 0.18;
const EDGE_BOUNCE_ZONE = 0.03;
const EDGE_BOUNCE_MIN_SPEED = 0.24;
const EDGE_BOUNCE_RESTITUTION = 0.62;
const EDGE_BOUNCE_COOLDOWN = 0.08;
const ASSIST_MICRO_TILT_MIN = 0.02;
const ASSIST_MICRO_TILT_MAX = 0.09;
const ASSIST_CENTER_KP = 0.52;
const ASSIST_CENTER_KD = 0.24;
const ASSIST_PULSE_STEP = 0.0035;
const ASSIST_PULSE_DAMP = 0.86;
const ASSIST_PULSE_POS_DEADBAND = 0.012;
const ASSIST_PULSE_VEL_DEADBAND = 0.03;
const ASSIST_PULSE_ON_TIME = 0.05;
const ASSIST_PULSE_OFF_TIME = 0.05;
const ASSIST_EDGE_EMERGENCY_RATIO = 0.85;
const ASSIST_EDGE_EMERGENCY_TILT = 0.06;
const COMPASS_TAPE_STEP = 5;
const COMPASS_PX_PER_DEG = 4;
const COMPASS_RANGE_MIN = -720;
const COMPASS_RANGE_MAX = 1080;
const CORRECTION_ARROW_MIN_SIGNAL = 0.02;
const CORRECTION_ARROW_POP_LERP = 0.28;
const CORRECTION_ARROW_HIDE_LERP = 0.2;
const MINI_CAM_WIDTH = 280;
const MINI_CAM_HEIGHT = 158;
const MINI_CAM_MARGIN = 16;
const ENV_MODE_CITY = 'city';
const ENV_MODE_MOUNTAIN = 'mountain';
const OBSTACLE_COLLISION_PADDING = 0.05;
const FRONT_SENSOR_MAX_RANGE = 120;

function createCorrectionArrow() {
    const indicator = new THREE.Group();

    const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.026, 0.34, 12),
        new THREE.MeshStandardMaterial({ color: 0x39d8ff, emissive: 0x0b3f5a, emissiveIntensity: 0.9 })
    );
    shaft.position.y = 0.17;

    const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.16, 14),
        new THREE.MeshStandardMaterial({ color: 0xffd976, emissive: 0x5a4105, emissiveIntensity: 0.95 })
    );
    tip.position.y = -0.08;
    tip.rotation.x = Math.PI;

    indicator.add(shaft);
    indicator.add(tip);
    indicator.visible = false;
    indicator.scale.setScalar(0.001);
    return indicator;
}

function createSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function createCityEnvironment() {
    const group = new THREE.Group();
    const colliders = [];
    const rand = createSeededRandom(53121);

    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x323943, roughness: 0.95 });
    const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0x5a6672, roughness: 0.82, metalness: 0.08 });
    const roadStripLength = 164;
    const cityHalfSize = 72;
    const gridStep = 8;
    const centralClearRadius = 16;

    for (let coordinate = -cityHalfSize; coordinate <= cityHalfSize; coordinate += gridStep) {
        const roadX = new THREE.Mesh(new THREE.BoxGeometry(roadStripLength, 0.06, 1.2), roadMaterial);
        roadX.position.set(0, 0.03, coordinate);
        group.add(roadX);

        const roadZ = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, roadStripLength), roadMaterial);
        roadZ.position.set(coordinate, 0.03, 0);
        group.add(roadZ);
    }

    const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);

    for (let x = -cityHalfSize; x <= cityHalfSize; x += gridStep) {
        for (let z = -cityHalfSize; z <= cityHalfSize; z += gridStep) {
            if (Math.hypot(x, z) < centralClearRadius) {
                continue;
            }

            if (rand() < 0.42) {
                continue;
            }

            const height = 2 + Math.pow(rand(), 1.35) * 24;
            const width = 2 + rand() * 2.6;
            const depth = 2 + rand() * 2.6;

            const building = new THREE.Mesh(buildingGeometry, buildingMaterial.clone());
            building.scale.set(width, height, depth);
            building.position.set(
                x + (rand() - 0.5) * 2.3,
                height * 0.5,
                z + (rand() - 0.5) * 2.3
            );

            const lightness = 0.3 + rand() * 0.28;
            building.material.color.setHSL(0.58 + rand() * 0.05, 0.15, lightness);
            group.add(building);

            colliders.push({
                x: building.position.x,
                y: building.position.y,
                z: building.position.z,
                hx: width * 0.5,
                hy: height * 0.5,
                hz: depth * 0.5,
            });
        }
    }

    return { group, colliders };
}

function createMountainPlainsEnvironment() {
    const group = new THREE.Group();
    const colliders = [];
    const rand = createSeededRandom(97421);
    const mountainMaterial = new THREE.MeshStandardMaterial({ color: 0x7f7663, roughness: 0.96, metalness: 0.02 });
    const hillMaterial = new THREE.MeshStandardMaterial({ color: 0x7a8d65, roughness: 1.0 });

    const mountainGeometry = new THREE.ConeGeometry(1, 1, 7);
    for (let index = 0; index < 160; index += 1) {
        const angle = rand() * Math.PI * 2;
        const radius = 24 + rand() * 74;
        const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial.clone());

        const baseRadius = 2.8 + rand() * 7;
        const height = 5 + rand() * 24;
        mountain.scale.set(baseRadius, height, baseRadius);
        mountain.position.set(Math.cos(angle) * radius, height * 0.5 - 0.05, Math.sin(angle) * radius);
        mountain.rotation.y = rand() * Math.PI * 2;
        mountain.material.color.offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.1);
        group.add(mountain);

        colliders.push({
            x: mountain.position.x,
            y: mountain.position.y,
            z: mountain.position.z,
            hx: baseRadius * 0.72,
            hy: height * 0.5,
            hz: baseRadius * 0.72,
        });
    }

    const hillGeometry = new THREE.SphereGeometry(1, 12, 10);
    for (let index = 0; index < 90; index += 1) {
        const angle = rand() * Math.PI * 2;
        const radius = 18 + rand() * 60;
        const hill = new THREE.Mesh(hillGeometry, hillMaterial.clone());
        const scaleXZ = 2 + rand() * 4;
        const scaleY = 0.5 + rand() * 1.4;
        const scaleZ = scaleXZ * (0.8 + rand() * 0.4);

        hill.scale.set(scaleXZ, scaleY, scaleZ);
        hill.position.set(Math.cos(angle) * radius, scaleY - 0.6, Math.sin(angle) * radius);
        hill.material.color.offsetHSL((rand() - 0.5) * 0.05, 0, (rand() - 0.5) * 0.14);
        group.add(hill);

        colliders.push({
            x: hill.position.x,
            y: hill.position.y,
            z: hill.position.z,
            hx: scaleXZ,
            hy: scaleY,
            hz: scaleZ,
        });
    }

    return { group, colliders };
}

function createObstacleBodies(colliderDefs, material) {
    return colliderDefs.map((collider) => {
        const body = new CANNON.Body({
            mass: 0,
            type: CANNON.Body.STATIC,
            material,
            shape: new CANNON.Box(new CANNON.Vec3(collider.hx, collider.hy, collider.hz)),
            position: new CANNON.Vec3(collider.x, collider.y, collider.z),
        });
        return body;
    });
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb7d0e8);

const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0),
});
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 20;
world.solver.tolerance = 0.001;
world.allowSleep = false;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 4, 8);

const droneFrontCamera = new THREE.PerspectiveCamera(76, MINI_CAM_WIDTH / MINI_CAM_HEIGHT, 0.03, 220);
droneFrontCamera.position.set(0, 0.12, -0.56);
droneFrontCamera.rotation.y = 0;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(8, 14, 10);
scene.add(directionalLight);

const groundVisualMaterial = new THREE.MeshStandardMaterial({ color: 0x646c75 });
const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    groundVisualMaterial
);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.y = 0;
scene.add(groundMesh);

const { group: cityEnvironment, colliders: cityObstacleColliders } = createCityEnvironment();
const { group: mountainEnvironment, colliders: mountainObstacleColliders } = createMountainPlainsEnvironment();
scene.add(cityEnvironment);
scene.add(mountainEnvironment);

const groundPhysMaterial = new CANNON.Material('ground');
const trayPhysMaterial = new CANNON.Material('tray');
const ballPhysMaterial = new CANNON.Material('ball');
const obstaclePhysMaterial = new CANNON.Material('obstacle');

const cityObstacleBodies = createObstacleBodies(cityObstacleColliders, obstaclePhysMaterial);
const mountainObstacleBodies = createObstacleBodies(mountainObstacleColliders, obstaclePhysMaterial);
let activeObstacleBodies = [];
let activeObstacleColliders = [];

const groundBody = new CANNON.Body({
    mass: 0,
    material: groundPhysMaterial,
    shape: new CANNON.Plane(),
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

const drone = createDrone();
drone.position.set(0, DRONE_HEIGHT, 0);
scene.add(drone);
drone.add(droneFrontCamera);

const trayCenterHighlightFill = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshStandardMaterial({
        color: 0xff5a5a,
        emissive: 0x4d1212,
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
    })
);
trayCenterHighlightFill.rotation.x = -Math.PI * 0.5;
trayCenterHighlightFill.position.set(0, 0.248, 0);
drone.add(trayCenterHighlightFill);

const trayCenterHighlightRing = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1, 56),
    new THREE.MeshStandardMaterial({
        color: 0xff9a9a,
        emissive: 0x6a1b1b,
        emissiveIntensity: 0.75,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
    })
);
trayCenterHighlightRing.rotation.x = -Math.PI * 0.5;
trayCenterHighlightRing.position.set(0, 0.249, 0);
drone.add(trayCenterHighlightRing);

const correctionArrow = createCorrectionArrow();
scene.add(correctionArrow);

const trayHalfExtents = new CANNON.Vec3(0.6, 0.06, 0.6);
const trayBody = new CANNON.Body({
    type: CANNON.Body.KINEMATIC,
    mass: 0,
    material: trayPhysMaterial,
    position: new CANNON.Vec3(0, DRONE_HEIGHT + TRAY_OFFSET_Y, 0),
});

const trayWallThickness = 0.06;
const trayWallHeight = 0.16;
const trayInnerHalf = 0.6;

trayBody.addShape(new CANNON.Box(trayHalfExtents), new CANNON.Vec3(0, 0, 0));
trayBody.addShape(
    new CANNON.Box(new CANNON.Vec3(trayInnerHalf, trayWallHeight * 0.5, trayWallThickness * 0.5)),
    new CANNON.Vec3(0, trayWallHeight * 0.5, trayInnerHalf - trayWallThickness * 0.5)
);
trayBody.addShape(
    new CANNON.Box(new CANNON.Vec3(trayInnerHalf, trayWallHeight * 0.5, trayWallThickness * 0.5)),
    new CANNON.Vec3(0, trayWallHeight * 0.5, -trayInnerHalf + trayWallThickness * 0.5)
);
trayBody.addShape(
    new CANNON.Box(new CANNON.Vec3(trayWallThickness * 0.5, trayWallHeight * 0.5, trayInnerHalf)),
    new CANNON.Vec3(trayInnerHalf - trayWallThickness * 0.5, trayWallHeight * 0.5, 0)
);
trayBody.addShape(
    new CANNON.Box(new CANNON.Vec3(trayWallThickness * 0.5, trayWallHeight * 0.5, trayInnerHalf)),
    new CANNON.Vec3(-trayInnerHalf + trayWallThickness * 0.5, trayWallHeight * 0.5, 0)
);
world.addBody(trayBody);

const ballRadius = 0.18;
const traySafeHalf = trayInnerHalf - trayWallThickness * 0.5 - ballRadius;
const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(ballRadius, 28, 20),
    new THREE.MeshStandardMaterial({ color: 0xff4e42 })
);
scene.add(ballMesh);

const ballBody = new CANNON.Body({
    mass: 0.95,
    material: ballPhysMaterial,
    shape: new CANNON.Sphere(ballRadius),
    position: new CANNON.Vec3(0, DRONE_HEIGHT + TRAY_OFFSET_Y + 0.25, 0),
    linearDamping: 0.035,
    angularDamping: 0.05,
});
ballBody.ccdSpeedThreshold = 0.01;
ballBody.ccdIterations = 10;
world.addBody(ballBody);

world.addContactMaterial(
    new CANNON.ContactMaterial(groundPhysMaterial, ballPhysMaterial, {
        friction: 0.45,
        restitution: 0.2,
    })
);

world.addContactMaterial(
    new CANNON.ContactMaterial(trayPhysMaterial, ballPhysMaterial, {
        friction: 0.12,
        restitution: 0.08,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 3,
        frictionEquationStiffness: 1e7,
        frictionEquationRelaxation: 3,
    })
);

world.addContactMaterial(
    new CANNON.ContactMaterial(obstaclePhysMaterial, ballPhysMaterial, {
        friction: 0.22,
        restitution: 0.06,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 3,
        frictionEquationStiffness: 1e7,
        frictionEquationRelaxation: 3,
    })
);

const movement = {
    x: 0,
    z: 0,
    y: 0,
    roll: 0,
    pitch: 0,
    yaw: 0,
    yawRate: 0,
};

const targetMovement = {
    x: 0,
    z: 0,
    y: 0,
    roll: 0,
    pitch: 0,
    yawRate: 0,
};

const assistPulseTilt = {
    roll: 0,
    pitch: 0,
};

const assistPulseCycle = {
    rollOn: false,
    pitchOn: false,
    rollTimer: 0,
    pitchTimer: 0,
};

let autoBalance = false;
let assistedMode = true;
let outOfTrayTime = 0;
let centerRegionRatio = CENTER_REGION_RATIO_DEFAULT;
let centerHoldActive = false;
let edgeBounceCooldown = 0;
let debugHudVisible = false;
let prevGamepadYPressed = false;
let prevGamepadXPressed = false;
let correctionArrowScale = 0;
let correctionActive = false;
let environmentMode = ENV_MODE_CITY;

window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyB') {
        autoBalance = !autoBalance;
    }
    if (event.code === 'KeyG') {
        assistedMode = !assistedMode;
    }
    if (event.code === 'KeyT') {
        toggleEnvironmentMode();
    }
    if (event.code === 'F3') {
        event.preventDefault();
        debugHudVisible = !debugHudVisible;
        if (debugHud) {
            debugHud.classList.toggle('hidden', !debugHudVisible);
        }
        if (gameHud) {
            gameHud.classList.toggle('hidden', debugHudVisible);
        }
    }
});

const trayQuat = new CANNON.Quaternion();
const trayPos = new CANNON.Vec3();
const cameraOffset = new THREE.Vector3(0, 3.8, 7.5);
const cameraTargetPos = new THREE.Vector3();
const telemetry = {
    mode: document.getElementById('tm-mode'),
    assisted: document.getElementById('tm-assisted'),
    environment: document.getElementById('tm-env'),
    frontDistance: document.getElementById('tm-front-distance'),
    ballInTray: document.getElementById('tm-ball-in-tray'),
    ballInCenter: document.getElementById('tm-center'),
    position: document.getElementById('tm-position'),
    altitude: document.getElementById('tm-altitude'),
    speed: document.getElementById('tm-speed'),
    pitch: document.getElementById('tm-pitch'),
    roll: document.getElementById('tm-roll'),
    yaw: document.getElementById('tm-yaw'),
};
const centerRegionSlider = document.getElementById('center-region-slider');
const centerRegionValue = document.getElementById('center-region-value');
const overlay = document.getElementById('overlay');
const resetButton = document.getElementById('reset-btn');
const debugHud = document.getElementById('debug-hud');
const gameHud = document.getElementById('game-hud');
const miniCamFrame = document.getElementById('mini-cam-frame');
const compass = document.getElementById('compass');
const compassTape = document.getElementById('compass-tape');
const compassHeading = document.getElementById('compass-heading');
const keyboardGlyphs = document.getElementById('keyboard-glyphs');
const gamepadGlyphs = document.getElementById('gamepad-glyphs');
const activeInputLabel = document.getElementById('active-input-label');
const gameTelemetry = {
    mode: document.getElementById('gh-mode'),
    assisted: document.getElementById('gh-assisted'),
    environment: document.getElementById('gh-env'),
    frontDistance: document.getElementById('gh-front-distance'),
    altitude: document.getElementById('gh-altitude'),
    speed: document.getElementById('gh-speed'),
    ballInTray: document.getElementById('gh-ball-in-tray'),
    ballInCenter: document.getElementById('gh-center'),
};
const attitudeEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const trayToWorldQuat = new THREE.Quaternion();
const worldToTrayQuat = new THREE.Quaternion();
const ballOffsetWorld = new THREE.Vector3();
const relativeVelocityWorld = new THREE.Vector3();
const ballLocalPosition = new THREE.Vector3();
const ballLocalVelocity = new THREE.Vector3();
const correctionArrowOffset = new THREE.Vector3(0.9, 0.65, 0.35);
const correctionArrowWorldPos = new THREE.Vector3();
const correctionArrowTargetDir = new THREE.Vector3(1, 0, 0);
const correctionArrowDirection = new THREE.Vector3(1, 0, 0);
const correctionUpAxis = new THREE.Vector3(0, 1, 0);
const frontSensorOrigin = new THREE.Vector3();
const frontSensorDirection = new THREE.Vector3();

function rayAabbDistance(origin, direction, box) {
    const minX = box.x - box.hx;
    const maxX = box.x + box.hx;
    const minY = box.y - box.hy;
    const maxY = box.y + box.hy;
    const minZ = box.z - box.hz;
    const maxZ = box.z + box.hz;

    let tmin = 0;
    let tmax = FRONT_SENSOR_MAX_RANGE;

    const slabs = [
        { o: origin.x, d: direction.x, min: minX, max: maxX },
        { o: origin.y, d: direction.y, min: minY, max: maxY },
        { o: origin.z, d: direction.z, min: minZ, max: maxZ },
    ];

    for (let index = 0; index < slabs.length; index += 1) {
        const slab = slabs[index];
        if (Math.abs(slab.d) < 1e-6) {
            if (slab.o < slab.min || slab.o > slab.max) {
                return null;
            }
            continue;
        }

        const inv = 1 / slab.d;
        let t1 = (slab.min - slab.o) * inv;
        let t2 = (slab.max - slab.o) * inv;

        if (t1 > t2) {
            const swap = t1;
            t1 = t2;
            t2 = swap;
        }

        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);

        if (tmax < tmin) {
            return null;
        }
    }

    if (tmax < 0) {
        return null;
    }

    return tmin >= 0 ? tmin : tmax;
}

function getFrontObstacleDistance() {
    frontSensorOrigin.copy(drone.position).add(new THREE.Vector3(0, 0.12, 0).applyQuaternion(drone.quaternion));
    frontSensorDirection.set(0, 0, -1).applyQuaternion(drone.quaternion).normalize();

    let nearest = FRONT_SENSOR_MAX_RANGE;
    for (let index = 0; index < activeObstacleColliders.length; index += 1) {
        const hitDistance = rayAabbDistance(frontSensorOrigin, frontSensorDirection, activeObstacleColliders[index]);
        if (hitDistance !== null && hitDistance < nearest) {
            nearest = hitDistance;
        }
    }

    if (nearest >= FRONT_SENSOR_MAX_RANGE - 1e-3) {
        return null;
    }

    return nearest;
}

function normalizeHeading(degrees) {
    return ((degrees % 360) + 360) % 360;
}

function getCompassLabel(headingDegrees) {
    const normalized = normalizeHeading(headingDegrees);

    if (normalized === 0) {
        return { text: 'N', cardinal: true };
    }
    if (normalized === 90) {
        return { text: 'E', cardinal: true };
    }
    if (normalized === 180) {
        return { text: 'S', cardinal: true };
    }
    if (normalized === 270) {
        return { text: 'W', cardinal: true };
    }

    if (normalized % 15 === 0) {
        return { text: `${normalized}`.padStart(3, '0'), cardinal: false };
    }

    return null;
}

function buildCompassTape() {
    if (!compassTape) {
        return;
    }

    compassTape.innerHTML = '';

    for (let degree = COMPASS_RANGE_MIN; degree <= COMPASS_RANGE_MAX; degree += COMPASS_TAPE_STEP) {
        const mark = document.createElement('div');
        const major = degree % 15 === 0;
        mark.className = major ? 'compass-mark major' : 'compass-mark';
        mark.style.left = `${degree * COMPASS_PX_PER_DEG}px`;
        compassTape.appendChild(mark);

        if (major) {
            const labelData = getCompassLabel(degree);
            if (labelData) {
                const label = document.createElement('div');
                label.className = labelData.cardinal ? 'compass-label cardinal' : 'compass-label';
                label.style.left = `${degree * COMPASS_PX_PER_DEG}px`;
                label.textContent = labelData.text;
                compassTape.appendChild(label);
            }
        }
    }
}

buildCompassTape();

function getEnvironmentLabel() {
    return environmentMode === ENV_MODE_CITY ? 'CITY' : 'MOUNTAIN PLAINS';
}

function applyEnvironmentMode() {
    const cityActive = environmentMode === ENV_MODE_CITY;
    cityEnvironment.visible = cityActive;
    mountainEnvironment.visible = !cityActive;

    activeObstacleBodies.forEach((body) => world.removeBody(body));
    if (cityActive) {
        cityObstacleBodies.forEach((body) => world.addBody(body));
        activeObstacleBodies = cityObstacleBodies;
        activeObstacleColliders = cityObstacleColliders;
    } else {
        mountainObstacleBodies.forEach((body) => world.addBody(body));
        activeObstacleBodies = mountainObstacleBodies;
        activeObstacleColliders = mountainObstacleColliders;
    }

    groundVisualMaterial.color.setHex(cityActive ? 0x646c75 : 0x6f8c63);
    scene.background.set(cityActive ? 0xa8b6ca : 0xb7d0e8);
}

function toggleEnvironmentMode() {
    environmentMode = environmentMode === ENV_MODE_CITY ? ENV_MODE_MOUNTAIN : ENV_MODE_CITY;
    applyEnvironmentMode();
}

applyEnvironmentMode();

function updateBallLocalState() {
    trayToWorldQuat.set(
        trayBody.quaternion.x,
        trayBody.quaternion.y,
        trayBody.quaternion.z,
        trayBody.quaternion.w
    );
    worldToTrayQuat.copy(trayToWorldQuat).invert();

    ballOffsetWorld.set(
        ballBody.position.x - trayBody.position.x,
        ballBody.position.y - trayBody.position.y,
        ballBody.position.z - trayBody.position.z
    );
    ballLocalPosition.copy(ballOffsetWorld).applyQuaternion(worldToTrayQuat);

    relativeVelocityWorld.set(
        ballBody.velocity.x - trayBody.velocity.x,
        ballBody.velocity.y - trayBody.velocity.y,
        ballBody.velocity.z - trayBody.velocity.z
    );
    ballLocalVelocity.copy(relativeVelocityWorld).applyQuaternion(worldToTrayQuat);
}

function isBallInsideTray() {
    return (
        Math.abs(ballLocalPosition.x) <= traySafeHalf + EDGE_CONTACT_TOLERANCE &&
        Math.abs(ballLocalPosition.z) <= traySafeHalf + EDGE_CONTACT_TOLERANCE &&
        ballLocalPosition.y >= -0.08
    );
}

function getCenterRegionHalfSize() {
    return THREE.MathUtils.clamp(
        traySafeHalf * centerRegionRatio,
        CENTER_REGION_MIN,
        CENTER_REGION_MAX
    );
}

function updateCenterHighlightVisual(ballInCenter = false) {
    const regionHalfSize = getCenterRegionHalfSize();
    const highlightRadius = THREE.MathUtils.clamp(regionHalfSize, CENTER_REGION_MIN, traySafeHalf);
    trayCenterHighlightFill.scale.setScalar(highlightRadius);
    trayCenterHighlightRing.scale.setScalar(highlightRadius);

    if (ballInCenter) {
        trayCenterHighlightFill.material.opacity = 0.28;
        trayCenterHighlightRing.material.opacity = 0.95;
    } else {
        trayCenterHighlightFill.material.opacity = 0.16;
        trayCenterHighlightRing.material.opacity = 0.62;
    }
}

function isBallInCenterRegion(regionHalfSize) {
    return (
        Math.abs(ballLocalPosition.x) <= regionHalfSize &&
        Math.abs(ballLocalPosition.z) <= regionHalfSize
    );
}

function toDegrees(radians) {
    return radians * (180 / Math.PI);
}

function moveToward(current, target, maxStep) {
    if (target > current + maxStep) {
        return current + maxStep;
    }
    if (target < current - maxStep) {
        return current - maxStep;
    }
    return target;
}

function updateAssistPulseAxis(currentCmd, position, velocity, edgeDanger) {
    const nearCenter =
        Math.abs(position) < ASSIST_PULSE_POS_DEADBAND &&
        Math.abs(velocity) < ASSIST_PULSE_VEL_DEADBAND;

    if (nearCenter) {
        return currentCmd * ASSIST_PULSE_DAMP;
    }

    const correction = position * ASSIST_CENTER_KP + velocity * ASSIST_CENTER_KD;
    const next = currentCmd + Math.sign(correction) * ASSIST_PULSE_STEP;
    const cap = THREE.MathUtils.lerp(ASSIST_MICRO_TILT_MIN, ASSIST_MICRO_TILT_MAX, edgeDanger);
    return THREE.MathUtils.clamp(next, -cap, cap);
}

function computeMicroTiltTarget(position, velocity, edgeDanger) {
    const tiltCap = THREE.MathUtils.lerp(ASSIST_MICRO_TILT_MIN, ASSIST_MICRO_TILT_MAX, edgeDanger);
    let correction = position * ASSIST_CENTER_KP + velocity * ASSIST_CENTER_KD;

    if (position * velocity < 0) {
        correction *= 0.45;
    }

    return THREE.MathUtils.clamp(correction, -tiltCap, tiltCap);
}

function updatePulsePhase(timerValue, phaseOn) {
    if (timerValue > 0) {
        return { timer: timerValue - FIXED_TIME_STEP, phaseOn };
    }

    const nextPhaseOn = !phaseOn;
    return {
        phaseOn: nextPhaseOn,
        timer: nextPhaseOn ? ASSIST_PULSE_ON_TIME : ASSIST_PULSE_OFF_TIME,
    };
}

function updateTelemetry() {
    if (!telemetry.mode) {
        return;
    }

    const speed = Math.hypot(trayBody.velocity.x, trayBody.velocity.y, trayBody.velocity.z);
    const frontDistance = getFrontObstacleDistance();
    const frontDistanceText = frontDistance === null ? '--' : `${frontDistance.toFixed(1)} m`;
    attitudeEuler.setFromQuaternion(drone.quaternion, 'YXZ');

    telemetry.mode.textContent = autoBalance ? 'AUTO-BAL' : 'MANUAL';
    telemetry.assisted.textContent = assistedMode ? 'ON' : 'OFF';
    if (telemetry.environment) {
        telemetry.environment.textContent = getEnvironmentLabel();
    }
    if (telemetry.frontDistance) {
        telemetry.frontDistance.textContent = frontDistanceText;
    }

    const ballInside = isBallInsideTray();
    const ballInCenter = isBallInCenterRegion(getCenterRegionHalfSize());
    updateCenterHighlightVisual(ballInCenter);
    telemetry.ballInTray.textContent = ballInside ? 'YES' : 'NO';
    telemetry.ballInTray.classList.toggle('status-good', ballInside);
    telemetry.ballInTray.classList.toggle('status-bad', !ballInside);
    telemetry.ballInCenter.textContent = ballInCenter ? 'YES' : 'NO';
    telemetry.ballInCenter.classList.toggle('status-good', ballInCenter);
    telemetry.ballInCenter.classList.toggle('status-bad', !ballInCenter);

    telemetry.position.textContent = `(${drone.position.x.toFixed(2)}, ${drone.position.y.toFixed(2)}, ${drone.position.z.toFixed(2)})`;
    telemetry.altitude.textContent = `${drone.position.y.toFixed(2)} m`;
    telemetry.speed.textContent = `${speed.toFixed(2)} m/s`;
    telemetry.pitch.textContent = `${toDegrees(attitudeEuler.x).toFixed(1)}°`;
    telemetry.roll.textContent = `${toDegrees(attitudeEuler.z).toFixed(1)}°`;
    const yawDegrees = toDegrees(attitudeEuler.y);
    telemetry.yaw.textContent = `${yawDegrees.toFixed(1)}°`;

    if (gameTelemetry.mode) {
        gameTelemetry.mode.textContent = autoBalance ? 'AUTO-BAL' : 'MANUAL';
        gameTelemetry.assisted.textContent = assistedMode ? 'ON' : 'OFF';
        if (gameTelemetry.environment) {
            gameTelemetry.environment.textContent = getEnvironmentLabel();
        }
        if (gameTelemetry.frontDistance) {
            gameTelemetry.frontDistance.textContent = frontDistanceText;
        }
        gameTelemetry.altitude.textContent = `${drone.position.y.toFixed(2)} m`;
        gameTelemetry.speed.textContent = `${speed.toFixed(2)} m/s`;
        gameTelemetry.ballInTray.textContent = ballInside ? 'YES' : 'NO';
        gameTelemetry.ballInCenter.textContent = ballInCenter ? 'YES' : 'NO';
        gameTelemetry.ballInTray.classList.toggle('status-good', ballInside);
        gameTelemetry.ballInTray.classList.toggle('status-bad', !ballInside);
        gameTelemetry.ballInCenter.classList.toggle('status-good', ballInCenter);
        gameTelemetry.ballInCenter.classList.toggle('status-bad', !ballInCenter);
    }

    if (compassTape) {
        const heading = normalizeHeading(yawDegrees);
        const centerOffset = (compass.clientWidth * 0.5) - (heading * COMPASS_PX_PER_DEG);
        compassTape.style.transform = `translateX(${centerOffset.toFixed(1)}px)`;

        if (compassHeading) {
            compassHeading.textContent = `(${Math.round(heading).toString().padStart(3, '0')}°)`;
        }
    }

    if (activeInputLabel) {
        const usingGamepad = activeInputSource === 'gamepad';
        activeInputLabel.textContent = usingGamepad ? 'Gamepad' : 'Keyboard';
        if (keyboardGlyphs && gamepadGlyphs) {
            keyboardGlyphs.classList.toggle('hidden', usingGamepad);
            gamepadGlyphs.classList.toggle('hidden', !usingGamepad);
        }
    }
}

function setOverlayVisible(visible) {
    if (!overlay) {
        return;
    }
    overlay.classList.toggle('hidden', !visible);
}

function resetSimulation() {
    movement.x = 0;
    movement.z = 0;
    movement.y = 0;
    movement.roll = 0;
    movement.pitch = 0;
    movement.yaw = 0;
    movement.yawRate = 0;

    targetMovement.x = 0;
    targetMovement.z = 0;
    targetMovement.y = 0;
    targetMovement.roll = 0;
    targetMovement.pitch = 0;
    targetMovement.yawRate = 0;

    assistPulseTilt.roll = 0;
    assistPulseTilt.pitch = 0;
    assistPulseCycle.rollOn = false;
    assistPulseCycle.pitchOn = false;
    assistPulseCycle.rollTimer = 0;
    assistPulseCycle.pitchTimer = 0;

    trayBody.position.set(0, DRONE_HEIGHT + TRAY_OFFSET_Y, 0);
    trayBody.velocity.set(0, 0, 0);
    trayBody.angularVelocity.set(0, 0, 0);
    trayBody.quaternion.set(0, 0, 0, 1);

    ballBody.position.set(0, DRONE_HEIGHT + TRAY_OFFSET_Y + 0.25, 0);
    ballBody.velocity.set(0, 0, 0);
    ballBody.angularVelocity.set(0, 0, 0);
    ballBody.quaternion.set(0, 0, 0, 1);

    outOfTrayTime = 0;
    centerHoldActive = false;
    edgeBounceCooldown = 0;
    correctionArrowScale = 0;
    correctionActive = false;
    correctionArrow.visible = false;
    correctionArrow.scale.setScalar(0.001);
    setOverlayVisible(false);
}

function applyEdgeBounceAssist() {
    if (edgeBounceCooldown > 0) {
        edgeBounceCooldown -= FIXED_TIME_STEP;
        return;
    }

    const wallThreshold = traySafeHalf - EDGE_BOUNCE_ZONE;
    const localVelocity = ballLocalVelocity.clone();
    let bounced = false;

    if (ballLocalPosition.x >= wallThreshold && localVelocity.x > -EDGE_BOUNCE_MIN_SPEED) {
        const incoming = Math.max(localVelocity.x, EDGE_BOUNCE_MIN_SPEED);
        localVelocity.x = -incoming * EDGE_BOUNCE_RESTITUTION;
        bounced = true;
    } else if (ballLocalPosition.x <= -wallThreshold && localVelocity.x < EDGE_BOUNCE_MIN_SPEED) {
        const incoming = Math.min(localVelocity.x, -EDGE_BOUNCE_MIN_SPEED);
        localVelocity.x = -incoming * EDGE_BOUNCE_RESTITUTION;
        bounced = true;
    }

    if (ballLocalPosition.z >= wallThreshold && localVelocity.z > -EDGE_BOUNCE_MIN_SPEED) {
        const incoming = Math.max(localVelocity.z, EDGE_BOUNCE_MIN_SPEED);
        localVelocity.z = -incoming * EDGE_BOUNCE_RESTITUTION;
        bounced = true;
    } else if (ballLocalPosition.z <= -wallThreshold && localVelocity.z < EDGE_BOUNCE_MIN_SPEED) {
        const incoming = Math.min(localVelocity.z, -EDGE_BOUNCE_MIN_SPEED);
        localVelocity.z = -incoming * EDGE_BOUNCE_RESTITUTION;
        bounced = true;
    }

    if (!bounced) {
        return;
    }

    const worldVelocity = localVelocity.clone().applyQuaternion(trayToWorldQuat);
    worldVelocity.x += trayBody.velocity.x;
    worldVelocity.y += trayBody.velocity.y;
    worldVelocity.z += trayBody.velocity.z;
    ballBody.velocity.set(worldVelocity.x, worldVelocity.y, worldVelocity.z);
    edgeBounceCooldown = EDGE_BOUNCE_COOLDOWN;
}

function updateCenterRegionUi(syncSlider = false) {
    if (!centerRegionValue || !centerRegionSlider) {
        return;
    }
    centerRegionValue.textContent = `${Math.round(centerRegionRatio * 100)}%`;
    if (syncSlider) {
        centerRegionSlider.value = `${Math.round(centerRegionRatio * 100)}`;
    }

    updateCenterHighlightVisual(isBallInCenterRegion(getCenterRegionHalfSize()));
}

function syncCenterRegionFromUi() {
    if (!centerRegionSlider) {
        return;
    }

    const value = Number(centerRegionSlider.value);
    if (!Number.isNaN(value)) {
        centerRegionRatio = THREE.MathUtils.clamp(value / 100, CENTER_REGION_RATIO_MIN, CENTER_REGION_RATIO_MAX);
    }

    if (centerRegionValue) {
        centerRegionValue.textContent = `${Math.round(centerRegionRatio * 100)}%`;
    }
}

if (centerRegionSlider) {
    centerRegionSlider.addEventListener('input', (event) => {
        const value = Number(event.target.value);
        if (!Number.isNaN(value)) {
            centerRegionRatio = THREE.MathUtils.clamp(value / 100, CENTER_REGION_RATIO_MIN, CENTER_REGION_RATIO_MAX);
            updateCenterRegionUi();
        }
    });

    centerRegionSlider.addEventListener('change', (event) => {
        const value = Number(event.target.value);
        if (!Number.isNaN(value)) {
            centerRegionRatio = THREE.MathUtils.clamp(value / 100, CENTER_REGION_RATIO_MIN, CENTER_REGION_RATIO_MAX);
            updateCenterRegionUi();
        }
    });
}

updateCenterRegionUi(true);

if (resetButton) {
    resetButton.addEventListener('click', resetSimulation);
}

function updateMovementState() {
    const edgeRatio = Math.max(
        Math.abs(ballLocalPosition.x) / Math.max(0.001, traySafeHalf),
        Math.abs(ballLocalPosition.z) / Math.max(0.001, traySafeHalf)
    );
    const rightStickNeutral =
        Math.abs(input.roll) < STICK_NEUTRAL_THRESHOLD &&
        Math.abs(input.pitch) < STICK_NEUTRAL_THRESHOLD;
    const rightStickActive = !rightStickNeutral;
    const centerRegionHalf = getCenterRegionHalfSize();
    const centerRegionHalfExit = THREE.MathUtils.clamp(
        centerRegionHalf * CENTER_HOLD_EXIT_SCALE,
        CENTER_REGION_MIN,
        CENTER_REGION_MAX
    );

    const safetyScale = assistedMode
        ? THREE.MathUtils.clamp(1 - edgeRatio * 0.9, 0.15, 1)
        : 1;

    targetMovement.y = input.throttle * VERTICAL_SPEED;
    targetMovement.yawRate = input.yaw * YAW_SPEED * (assistedMode ? 0.8 : 1);

    const stabilizeX = -(ballLocalPosition.x * ASSIST_STABILIZE_P + ballLocalVelocity.x * ASSIST_STABILIZE_D);
    const stabilizeZ = ballLocalPosition.z * ASSIST_STABILIZE_P + ballLocalVelocity.z * ASSIST_STABILIZE_D;
    const edgeDanger = THREE.MathUtils.clamp((edgeRatio - 0.35) / 0.45, 0, 1);
    const planarBallSpeed = Math.hypot(ballLocalVelocity.x, ballLocalVelocity.z);
    const inCenterRegion = isBallInCenterRegion(centerRegionHalf);
    const nearCenter = inCenterRegion;
    const slowNearCenter = planarBallSpeed < ASSIST_CENTER_VEL_DEADBAND;
    const shouldAutoLevel = rightStickNeutral && nearCenter && slowNearCenter;
    const pilotPlanarNeutral =
        Math.abs(input.moveX) < ASSIST_INPUT_NEUTRAL &&
        Math.abs(input.moveZ) < ASSIST_INPUT_NEUTRAL &&
        Math.abs(input.roll) < ASSIST_INPUT_NEUTRAL &&
        Math.abs(input.pitch) < ASSIST_INPUT_NEUTRAL;
    const centeredHold = isBallInCenterRegion(centerRegionHalf) && planarBallSpeed < ASSIST_CENTER_HOLD_VEL;
    const inCenterExitRegion = isBallInCenterRegion(centerRegionHalfExit);
    const effectiveRollInput = Math.abs(input.roll) < STICK_NEUTRAL_THRESHOLD ? 0 : input.roll;
    const effectivePitchInput = Math.abs(input.pitch) < STICK_NEUTRAL_THRESHOLD ? 0 : input.pitch;
    const pitchDominantInput =
        Math.abs(effectivePitchInput) > STICK_NEUTRAL_THRESHOLD &&
        Math.abs(effectiveRollInput) < STICK_NEUTRAL_THRESHOLD * 0.75;
    const rollDominantInput =
        Math.abs(effectiveRollInput) > STICK_NEUTRAL_THRESHOLD &&
        Math.abs(effectivePitchInput) < STICK_NEUTRAL_THRESHOLD * 0.75;
    const forwardStickOverride = pitchDominantInput;
    const correctionLocalX = ballLocalPosition.x + ballLocalVelocity.x * 0.25;
    const correctionLocalZ = ballLocalPosition.z + ballLocalVelocity.z * 0.25;

    if (pilotPlanarNeutral && centeredHold) {
        centerHoldActive = true;
    } else if (!pilotPlanarNeutral || !inCenterExitRegion) {
        centerHoldActive = false;
    }

    if (autoBalance) {
        if (forwardStickOverride) {
            targetMovement.roll = 0;
            targetMovement.pitch = THREE.MathUtils.clamp(-effectivePitchInput * TILT_LIMIT * 0.82, -TILT_LIMIT, TILT_LIMIT);
        } else
        if (pilotPlanarNeutral) {
            targetMovement.roll = THREE.MathUtils.clamp(stabilizeX, -TILT_LIMIT, TILT_LIMIT);
            targetMovement.pitch = THREE.MathUtils.clamp(-stabilizeZ, -TILT_LIMIT, TILT_LIMIT);
        } else {
            const stickRoll = effectiveRollInput * TILT_LIMIT * 0.78;
            const stickPitch = -effectivePitchInput * TILT_LIMIT * 0.78;
            const safetyInfluence = THREE.MathUtils.clamp((edgeRatio - EDGE_RESCUE_START) / (1 - EDGE_RESCUE_START), 0, 1);
            const safetyRoll = THREE.MathUtils.clamp(stabilizeX, -TILT_LIMIT * 0.82, TILT_LIMIT * 0.82);
            const safetyPitch = THREE.MathUtils.clamp(-stabilizeZ, -TILT_LIMIT * 0.82, TILT_LIMIT * 0.82);

            targetMovement.roll = THREE.MathUtils.lerp(stickRoll, safetyRoll, safetyInfluence);
            targetMovement.pitch = THREE.MathUtils.lerp(stickPitch, safetyPitch, safetyInfluence);
        }
    } else if (assistedMode) {
        if (!pilotPlanarNeutral) {
            assistPulseTilt.roll = 0;
            assistPulseTilt.pitch = 0;
            assistPulseCycle.rollOn = false;
            assistPulseCycle.pitchOn = false;
            assistPulseCycle.rollTimer = 0;
            assistPulseCycle.pitchTimer = 0;

            const stickRoll = forwardStickOverride ? 0 : effectiveRollInput * TILT_LIMIT * 0.78;
            const stickPitch = -effectivePitchInput * TILT_LIMIT * 0.78;
            const safetyInfluence = THREE.MathUtils.clamp((edgeRatio - EDGE_RESCUE_START) / (1 - EDGE_RESCUE_START), 0, 1);
            const safetyRoll = THREE.MathUtils.clamp(stabilizeX, -TILT_LIMIT * 0.82, TILT_LIMIT * 0.82);
            const safetyPitch = THREE.MathUtils.clamp(-stabilizeZ, -TILT_LIMIT * 0.82, TILT_LIMIT * 0.82);

            targetMovement.roll = THREE.MathUtils.lerp(stickRoll, safetyRoll, forwardStickOverride ? 0 : safetyInfluence);
            targetMovement.pitch = THREE.MathUtils.lerp(stickPitch, safetyPitch, forwardStickOverride ? 0 : safetyInfluence);
        } else if (inCenterRegion) {
            targetMovement.roll = 0;
            targetMovement.pitch = 0;
            assistPulseTilt.roll *= ASSIST_PULSE_DAMP;
            assistPulseTilt.pitch *= ASSIST_PULSE_DAMP;
            assistPulseCycle.rollOn = false;
            assistPulseCycle.pitchOn = false;
            assistPulseCycle.rollTimer = 0;
            assistPulseCycle.pitchTimer = 0;
        } else {
            const intentRoll = pilotPlanarNeutral ? 0 : input.moveX * ASSIST_INTENT_GAIN;
            const intentPitch = pilotPlanarNeutral ? 0 : -input.moveZ * ASSIST_INTENT_GAIN;

            const rollCorrection = -(ballLocalPosition.x * ASSIST_CENTER_KP + ballLocalVelocity.x * ASSIST_CENTER_KD);
            const pitchCorrection = -ballLocalPosition.z * ASSIST_CENTER_KP - ballLocalVelocity.z * ASSIST_CENTER_KD;
            const rollNearDeadband =
                Math.abs(ballLocalPosition.x) < ASSIST_PULSE_POS_DEADBAND &&
                Math.abs(ballLocalVelocity.x) < ASSIST_PULSE_VEL_DEADBAND;
            const pitchNearDeadband =
                Math.abs(ballLocalPosition.z) < ASSIST_PULSE_POS_DEADBAND &&
                Math.abs(ballLocalVelocity.z) < ASSIST_PULSE_VEL_DEADBAND;

            if (rollNearDeadband) {
                assistPulseCycle.rollOn = false;
                assistPulseCycle.rollTimer = 0;
                assistPulseTilt.roll = 0;
            } else {
                const rollPhase = updatePulsePhase(assistPulseCycle.rollTimer, assistPulseCycle.rollOn);
                assistPulseCycle.rollOn = rollPhase.phaseOn;
                assistPulseCycle.rollTimer = rollPhase.timer;
                if (assistPulseCycle.rollOn) {
                    const cap = THREE.MathUtils.lerp(ASSIST_MICRO_TILT_MIN, ASSIST_MICRO_TILT_MAX, edgeDanger);
                    assistPulseTilt.roll = Math.sign(rollCorrection) * cap;
                } else {
                    assistPulseTilt.roll = 0;
                }
            }

            if (pitchNearDeadband) {
                assistPulseCycle.pitchOn = false;
                assistPulseCycle.pitchTimer = 0;
                assistPulseTilt.pitch = 0;
            } else {
                const pitchPhase = updatePulsePhase(assistPulseCycle.pitchTimer, assistPulseCycle.pitchOn);
                assistPulseCycle.pitchOn = pitchPhase.phaseOn;
                assistPulseCycle.pitchTimer = pitchPhase.timer;
                if (assistPulseCycle.pitchOn) {
                    const cap = THREE.MathUtils.lerp(ASSIST_MICRO_TILT_MIN, ASSIST_MICRO_TILT_MAX, edgeDanger);
                    assistPulseTilt.pitch = Math.sign(pitchCorrection) * cap;
                } else {
                    assistPulseTilt.pitch = 0;
                }
            }

            let baseRoll = assistPulseTilt.roll + intentRoll + effectiveRollInput * ASSIST_STICK_BLEND;
            let basePitch = assistPulseTilt.pitch + intentPitch + effectivePitchInput * ASSIST_STICK_BLEND;

            if (pilotPlanarNeutral && !assistPulseCycle.rollOn) {
                baseRoll = 0;
            }

            if (pilotPlanarNeutral && !assistPulseCycle.pitchOn) {
                basePitch = 0;
            }

            if (edgeRatio > ASSIST_EDGE_EMERGENCY_RATIO) {
                baseRoll = assistPulseCycle.rollOn
                    ? THREE.MathUtils.clamp(
                        -ballLocalPosition.x * ASSIST_CENTER_KP,
                        -ASSIST_EDGE_EMERGENCY_TILT,
                        ASSIST_EDGE_EMERGENCY_TILT
                    )
                    : 0;
                basePitch = assistPulseCycle.pitchOn
                    ? THREE.MathUtils.clamp(
                        -ballLocalPosition.z * ASSIST_CENTER_KP,
                        -ASSIST_EDGE_EMERGENCY_TILT,
                        ASSIST_EDGE_EMERGENCY_TILT
                    )
                    : 0;
            }

            if (shouldAutoLevel) {
                targetMovement.roll = 0;
                targetMovement.pitch = 0;
            } else {
                targetMovement.roll = THREE.MathUtils.clamp(baseRoll, -TILT_LIMIT, TILT_LIMIT);
                targetMovement.pitch = THREE.MathUtils.clamp(basePitch, -TILT_LIMIT, TILT_LIMIT);
            }
        }
    } else {
        if (rightStickNeutral) {
            targetMovement.roll = THREE.MathUtils.clamp(stabilizeX * edgeDanger, -TILT_LIMIT, TILT_LIMIT);
            targetMovement.pitch = THREE.MathUtils.clamp(-stabilizeZ * edgeDanger, -TILT_LIMIT, TILT_LIMIT);
        } else {
            targetMovement.roll = THREE.MathUtils.clamp(effectiveRollInput * TILT_LIMIT * 0.8, -TILT_LIMIT, TILT_LIMIT);
            targetMovement.pitch = THREE.MathUtils.clamp(-effectivePitchInput * TILT_LIMIT * 0.8, -TILT_LIMIT, TILT_LIMIT);
        }
    }

    let forwardCommand = input.moveZ * MOVE_SPEED;
    let rightCommand = input.moveX * MOVE_SPEED;

    const forwardFromPitch = effectivePitchInput * MOVE_SPEED * PITCH_ROLL_MOVE_GAIN;
    const rightFromRoll = pitchDominantInput ? 0 : effectiveRollInput * MOVE_SPEED * PITCH_ROLL_MOVE_GAIN;
    forwardCommand += forwardFromPitch;
    rightCommand += rightFromRoll;

    if (assistedMode && !centerHoldActive && !forwardStickOverride) {
        if (!inCenterRegion) {
            const centerRight = THREE.MathUtils.clamp(
                (ballLocalPosition.x * ASSIST_CENTER_TRANSLATION_P + ballLocalVelocity.x * ASSIST_CENTER_TRANSLATION_D),
                -ASSIST_CENTER_TRANSLATION_MAX,
                ASSIST_CENTER_TRANSLATION_MAX
            );
            const centerForward = THREE.MathUtils.clamp(
                (ballLocalPosition.z * ASSIST_CENTER_TRANSLATION_P + ballLocalVelocity.z * ASSIST_CENTER_TRANSLATION_D),
                -ASSIST_CENTER_TRANSLATION_MAX,
                ASSIST_CENTER_TRANSLATION_MAX
            );
            let centerScale = pilotPlanarNeutral ? 1.0 : 0;
            if (!pilotPlanarNeutral) {
                const edgeRescueWeight = THREE.MathUtils.clamp((edgeRatio - EDGE_RESCUE_START) / (1 - EDGE_RESCUE_START), 0, 1);
                centerScale = edgeRescueWeight * 0.55;
            }
            const rightRescueGate = pitchDominantInput ? 0 : 1;
            const forwardRescueGate = rollDominantInput ? 0 : 1;
            rightCommand += centerRight * centerScale * rightRescueGate;
            forwardCommand += centerForward * centerScale * forwardRescueGate;

            if (edgeRatio > EDGE_RESCUE_START && planarBallSpeed < EDGE_STUCK_SPEED) {
                rightCommand += Math.sign(ballLocalPosition.x) * EDGE_UNSTICK_NUDGE;
                forwardCommand += Math.sign(ballLocalPosition.z) * EDGE_UNSTICK_NUDGE;
            }
        }

        if (pilotPlanarNeutral && centeredHold) {
            rightCommand = 0;
            forwardCommand = 0;
            targetMovement.roll = 0;
            targetMovement.pitch = 0;
        }
    }

    const commandYaw = movement.yaw + targetMovement.yawRate * FIXED_TIME_STEP;
    const cosYaw = Math.cos(commandYaw);
    const sinYaw = Math.sin(commandYaw);
    targetMovement.x = (rightCommand * cosYaw + forwardCommand * sinYaw) * safetyScale;
    targetMovement.z = (rightCommand * sinYaw - forwardCommand * cosYaw) * safetyScale;

    if (assistedMode && pilotPlanarNeutral && inCenterRegion) {
        targetMovement.x = 0;
        targetMovement.z = 0;
    }

    if (assistedMode) {
        const rescueBlend = THREE.MathUtils.clamp((edgeRatio - EDGE_RESCUE_START) / (1 - EDGE_RESCUE_START), 0, 1);
        const dynamicTiltLimit = THREE.MathUtils.lerp(TILT_LIMIT, EDGE_RESCUE_MAX_TILT, rescueBlend);
        targetMovement.roll = THREE.MathUtils.clamp(targetMovement.roll, -dynamicTiltLimit, dynamicTiltLimit);
        targetMovement.pitch = THREE.MathUtils.clamp(targetMovement.pitch, -dynamicTiltLimit, dynamicTiltLimit);
    }

    if (assistedMode) {
        targetMovement.x = moveToward(movement.x, targetMovement.x, ASSIST_DIRECTION_STEP_MAX);
        targetMovement.z = moveToward(movement.z, targetMovement.z, ASSIST_DIRECTION_STEP_MAX);
        targetMovement.roll = moveToward(movement.roll, targetMovement.roll, ASSIST_TILT_STEP_MAX);
        targetMovement.pitch = moveToward(movement.pitch, targetMovement.pitch, ASSIST_TILT_STEP_MAX);
    }

    const attitudeStepMax = ATTITUDE_RATE_LIMIT * FIXED_TIME_STEP;
    targetMovement.roll = moveToward(movement.roll, targetMovement.roll, attitudeStepMax);
    targetMovement.pitch = moveToward(movement.pitch, targetMovement.pitch, attitudeStepMax);

    movement.x = THREE.MathUtils.lerp(movement.x, targetMovement.x, MOVE_LERP);
    movement.z = THREE.MathUtils.lerp(movement.z, targetMovement.z, MOVE_LERP);
    movement.y = THREE.MathUtils.lerp(movement.y, targetMovement.y, MOVE_LERP);
    movement.roll = THREE.MathUtils.lerp(movement.roll, targetMovement.roll, TILT_LERP);
    movement.pitch = THREE.MathUtils.lerp(movement.pitch, targetMovement.pitch, TILT_LERP);
    movement.yawRate = THREE.MathUtils.lerp(movement.yawRate, targetMovement.yawRate, MOVE_LERP);
    movement.yaw += movement.yawRate * FIXED_TIME_STEP;

    if (assistedMode && pilotPlanarNeutral) {
        movement.x = THREE.MathUtils.lerp(movement.x, 0, ASSIST_STOP_DAMPING);
        movement.z = THREE.MathUtils.lerp(movement.z, 0, ASSIST_STOP_DAMPING);
        if (!assistPulseCycle.rollOn) {
            movement.roll = THREE.MathUtils.lerp(movement.roll, 0, 0.45);
        }
        if (!assistPulseCycle.pitchOn) {
            movement.pitch = THREE.MathUtils.lerp(movement.pitch, 0, 0.45);
        }
    }

    if (assistedMode && centerHoldActive) {
        movement.x = THREE.MathUtils.lerp(movement.x, 0, CENTER_HOLD_DAMPING);
        movement.z = THREE.MathUtils.lerp(movement.z, 0, CENTER_HOLD_DAMPING);
        movement.roll = THREE.MathUtils.lerp(movement.roll, 0, CENTER_HOLD_DAMPING);
        movement.pitch = THREE.MathUtils.lerp(movement.pitch, 0, CENTER_HOLD_DAMPING);
        targetMovement.roll = 0;
        targetMovement.pitch = 0;
    }

    if (assistedMode && pilotPlanarNeutral && inCenterRegion) {
        movement.x = THREE.MathUtils.lerp(movement.x, 0, CENTER_HOLD_TRANSLATION_DAMPING);
        movement.z = THREE.MathUtils.lerp(movement.z, 0, CENTER_HOLD_TRANSLATION_DAMPING);
        if (Math.abs(movement.x) < CENTER_HOLD_TRANSLATION_SNAP) {
            movement.x = 0;
        }
        if (Math.abs(movement.z) < CENTER_HOLD_TRANSLATION_SNAP) {
            movement.z = 0;
        }
    }

    if (shouldAutoLevel) {
        movement.roll = THREE.MathUtils.lerp(movement.roll, 0, ATTITUDE_RETURN_LERP);
        movement.pitch = THREE.MathUtils.lerp(movement.pitch, 0, ATTITUDE_RETURN_LERP);
    }

    const correctionTiltLocalX = targetMovement.roll;
    const correctionTiltLocalZ = -targetMovement.pitch;
    const correctionTiltSignal = Math.hypot(correctionTiltLocalX, correctionTiltLocalZ);
    const ballOffsetSignal = Math.hypot(correctionLocalX, correctionLocalZ);

    if (!inCenterRegion) {
        correctionActive = true;

        if (correctionTiltSignal > CORRECTION_ARROW_MIN_SIGNAL) {
            correctionArrowTargetDir.set(correctionTiltLocalX, 0, correctionTiltLocalZ);
        } else if (ballOffsetSignal > 0.0001) {
            correctionArrowTargetDir.set(correctionLocalX, 0, correctionLocalZ);
        } else {
            correctionArrowTargetDir.set(1, 0, 0);
        }

        correctionArrowTargetDir.applyQuaternion(trayToWorldQuat);
        correctionArrowTargetDir.y = 0;

        if (correctionArrowTargetDir.lengthSq() < 0.0001) {
            correctionArrowTargetDir.set(1, 0, 0);
        } else {
            correctionArrowTargetDir.normalize();
        }
    } else {
        correctionActive = false;
    }

}

function handleGamepadToggles() {
    const gamepad = navigator.getGamepads?.()[0];

    if (!gamepad) {
        prevGamepadYPressed = false;
        prevGamepadXPressed = false;
        return;
    }

    const yPressed = Boolean(gamepad.buttons?.[3]?.pressed);
    const xPressed = Boolean(gamepad.buttons?.[2]?.pressed);

    if (yPressed && !prevGamepadYPressed) {
        assistedMode = !assistedMode;
    }

    if (xPressed && !prevGamepadXPressed) {
        toggleEnvironmentMode();
    }

    prevGamepadYPressed = yPressed;
    prevGamepadXPressed = xPressed;
}

function updateTrayBody() {
    const desiredY = THREE.MathUtils.clamp(
        trayBody.position.y + movement.y * FIXED_TIME_STEP,
        MIN_ALTITUDE + TRAY_OFFSET_Y,
        MAX_ALTITUDE + TRAY_OFFSET_Y
    );
    const clampedYDelta = THREE.MathUtils.clamp(
        desiredY - trayBody.position.y,
        -MAX_VERTICAL_STEP,
        MAX_VERTICAL_STEP
    );

    let targetX = trayBody.position.x + movement.x * FIXED_TIME_STEP;
    let targetZ = trayBody.position.z + movement.z * FIXED_TIME_STEP;
    const targetY = trayBody.position.y + clampedYDelta;
    const trayHalfX = trayHalfExtents.x;
    const trayHalfY = trayHalfExtents.y + trayWallHeight;
    const trayHalfZ = trayHalfExtents.z;

    for (let index = 0; index < activeObstacleColliders.length; index += 1) {
        const obstacle = activeObstacleColliders[index];
        const overlapsX = Math.abs(targetX - obstacle.x) <= (trayHalfX + obstacle.hx + OBSTACLE_COLLISION_PADDING);
        const overlapsY = Math.abs(targetY - obstacle.y) <= (trayHalfY + obstacle.hy + OBSTACLE_COLLISION_PADDING);
        const overlapsZ = Math.abs(targetZ - obstacle.z) <= (trayHalfZ + obstacle.hz + OBSTACLE_COLLISION_PADDING);

        if (overlapsX && overlapsY && overlapsZ) {
            targetX = trayBody.position.x;
            targetZ = trayBody.position.z;
            movement.x *= 0.18;
            movement.z *= 0.18;
            targetMovement.x = 0;
            targetMovement.z = 0;
            break;
        }
    }

    trayPos.set(targetX, targetY, targetZ);

    const velocityX = (targetX - trayBody.position.x) / FIXED_TIME_STEP;
    const velocityZ = (targetZ - trayBody.position.z) / FIXED_TIME_STEP;
    trayBody.velocity.set(velocityX, clampedYDelta / FIXED_TIME_STEP, velocityZ);
    trayBody.angularVelocity.set(0, 0, 0);
    trayBody.position.copy(trayPos);

    trayQuat.setFromEuler(movement.pitch, movement.yaw, movement.roll, 'YXZ');
    trayBody.quaternion.copy(trayQuat);
}

function syncVisuals() {
    drone.position.set(
        trayBody.position.x,
        trayBody.position.y - TRAY_OFFSET_Y,
        trayBody.position.z
    );
    drone.quaternion.set(
        trayBody.quaternion.x,
        trayBody.quaternion.y,
        trayBody.quaternion.z,
        trayBody.quaternion.w
    );

    correctionArrowWorldPos.copy(correctionArrowOffset).applyQuaternion(drone.quaternion).add(drone.position);
    correctionArrow.position.copy(correctionArrowWorldPos);

    if (correctionActive) {
        correctionArrowScale = THREE.MathUtils.lerp(correctionArrowScale, 1, CORRECTION_ARROW_POP_LERP);
        correctionArrowDirection.lerp(correctionArrowTargetDir, 0.28).normalize();
        correctionArrow.visible = true;
    } else {
        correctionArrowScale = THREE.MathUtils.lerp(correctionArrowScale, 0, CORRECTION_ARROW_HIDE_LERP);
    }

    if (correctionArrowScale < 0.03 && !correctionActive) {
        correctionArrow.visible = false;
    }

    correctionArrow.quaternion.setFromUnitVectors(correctionUpAxis, correctionArrowDirection);
    correctionArrow.scale.setScalar(Math.max(0.001, correctionArrowScale));

    ballMesh.position.set(ballBody.position.x, ballBody.position.y, ballBody.position.z);
    ballMesh.quaternion.set(
        ballBody.quaternion.x,
        ballBody.quaternion.y,
        ballBody.quaternion.z,
        ballBody.quaternion.w
    );
}

function updateCamera() {
    const followOffset = cameraOffset.clone().applyQuaternion(drone.quaternion);
    cameraTargetPos.copy(drone.position).add(followOffset);
    camera.position.lerp(cameraTargetPos, CAMERA_LERP);

    const lookAtTarget = drone.position.clone().add(new THREE.Vector3(0, -0.35, 0));
    camera.lookAt(lookAtTarget);
}

function renderMiniCameraView() {
    if (!miniCamFrame) {
        return;
    }

    const insetWidth = Math.max(120, Math.min(MINI_CAM_WIDTH, window.innerWidth - MINI_CAM_MARGIN * 2));
    const insetHeight = Math.max(84, Math.min(MINI_CAM_HEIGHT, window.innerHeight - MINI_CAM_MARGIN * 2));
    const insetX = Math.max(MINI_CAM_MARGIN, window.innerWidth - insetWidth - MINI_CAM_MARGIN);
    const insetY = Math.max(MINI_CAM_MARGIN, window.innerHeight - insetHeight - MINI_CAM_MARGIN);

    miniCamFrame.style.width = `${insetWidth}px`;
    miniCamFrame.style.height = `${insetHeight}px`;

    droneFrontCamera.aspect = insetWidth / insetHeight;
    droneFrontCamera.updateProjectionMatrix();

    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.setViewport(insetX, insetY, insetWidth, insetHeight);
    renderer.setScissor(insetX, insetY, insetWidth, insetHeight);
    renderer.clearDepth();
    renderer.render(scene, droneFrontCamera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.autoClear = previousAutoClear;
}

function animate() {
    requestAnimationFrame(animate);

    updateInput();
    handleGamepadToggles();
    updateBallLocalState();

    updateMovementState();
    updateTrayBody();

    world.step(FIXED_TIME_STEP);

    updateBallLocalState();
    applyEdgeBounceAssist();

    if (isBallInsideTray()) {
        outOfTrayTime = 0;
        setOverlayVisible(false);
    } else {
        outOfTrayTime += FIXED_TIME_STEP;
        setOverlayVisible(outOfTrayTime >= OUT_OF_TRAY_GRACE_TIME);
    }

    syncVisuals();
    updateCamera();
    updateTelemetry();

    renderer.render(scene, camera);
    renderMiniCameraView();
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

