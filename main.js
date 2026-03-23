import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createDrone } from './drone.js';
import { activeInputSource, input, updateInput } from './input.js';
import { NavigationGrid } from './pathfinding.js';
import { AutonomySystem } from './autonomy.js';

const FIXED_TIME_STEP = 1 / 60;
const MOVE_SPEED = 4.0;
const TILT_LIMIT = 0.26;
const DRONE_HEIGHT = 2;
const TRAY_OFFSET_Y = 0.22;
const YAW_SPEED = 1.2;
const VERTICAL_SPEED = 1.6;
const MIN_ALTITUDE = 0.8;
const MAX_ALTITUDE = 8.5;
const MAX_VERTICAL_STEP = 0.02;
const STICK_NEUTRAL_THRESHOLD = 0.08;
const ATTITUDE_RETURN_LERP = 0.18;
const PITCH_ROLL_MOVE_GAIN = 0.95;
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
const ASSIST_CENTER_TRANSLATION_P = 0.95;
const ASSIST_CENTER_TRANSLATION_D = 0.55;
const ASSIST_CENTER_TRANSLATION_MAX = 0.55;
const ASSIST_CENTER_LOOKAHEAD = 0.24;
const ASSIST_CENTER_CAPTURE_BOOST = 1.2;
const ASSIST_CENTER_BRAKE_GAIN = 0.8;
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
const EDGE_BOUNCE_RESTITUTION = 0.48;
const EDGE_BOUNCE_COOLDOWN = 0.08;
const CENTER_LOCK_SPEED = 0.42;
const CENTER_LOCK_TRANSLATION = 0.02;
const CENTER_LOCK_DAMPING = 0.04;
const CENTER_LOCK_POSITION_GAIN = 1.95;
const CENTER_LOCK_VELOCITY_GAIN = 1.05;
const CENTER_LOCK_MAX_VELOCITY = 0.1;
const CENTER_LOCK_SNAP_POSITION = 0.006;
const CENTER_LOCK_SNAP_VELOCITY = 0.008;
const WIND_DRAG_TRIGGER_RADIUS = 140;
const WIND_PULSE_DECAY = 0.84;
const WIND_PULSE_MIN = 0.0015;
const WIND_FORCE_GAIN = 0.0024;
const WIND_TILT_GAIN = 0.0012;
const WIND_VERTICAL_GAIN = 0.0006;
const WIND_MAX_FORCE = 0.12;
const WIND_MAX_TILT = 0.055;
const WIND_MAX_YAW = 0.05;
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
const FPV_EYE_SEPARATION = 0.065;
const FPV_LEFT_EYE_SHIFT = 0.012;
const FPV_RIGHT_EYE_SHIFT = -0.006;
const FPV_DIVIDER_WIDTH = 4;
const DOUBLE_TAP_MAX_DELAY = 280;
const ENV_MODE_CITY = 'city';
const ENV_MODE_MOUNTAIN = 'mountain';
const OBSTACLE_COLLISION_PADDING = 0.05;
const FRONT_SENSOR_MAX_RANGE = 120;
const MINIMAP_SIZE = 220;
const MINIMAP_RANGE = 38;
const MINIMAP_OBSTACLE_LIMIT = 220;

const currentPage = window.location.pathname.toLowerCase();
const isMobileFrontView = currentPage.endsWith('/mobile.html') || currentPage.endsWith('mobile.html');

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

function showWindIndicator(clickX, clickY, targetX, targetY, strength) {
    if (!windIndicator || !windIndicatorLine || !windIndicatorHead || !windIndicatorLabel) {
        return;
    }

    const deltaX = targetX - clickX;
    const deltaY = targetY - clickY;
    const length = Math.max(32, Math.hypot(deltaX, deltaY));
    const angle = Math.atan2(deltaY, deltaX);

    windIndicator.style.left = `${clickX}px`;
    windIndicator.style.top = `${clickY}px`;
    windIndicator.style.width = `${length}px`;
    windIndicator.style.transform = `rotate(${angle}rad)`;
    windIndicator.style.opacity = `${THREE.MathUtils.clamp(0.45 + strength * 0.35, 0.45, 1)}`;
    windIndicator.classList.remove('hidden');
    windIndicatorLine.style.width = `${Math.max(24, length - 18)}px`;
    windIndicatorHead.style.left = `${Math.max(14, length - 18)}px`;
    windIndicatorLife = 1;
    windIndicatorAngle = angle;
    windIndicatorLength = length;
    windIndicatorLabel.textContent = `WIND ${Math.round(strength * 100)}%`;
}

function handleWindClick(event) {
    if (isMobileFrontView) {
        return;
    }

    if (event.button !== 0) {
        return;
    }

    camera.updateMatrixWorld(true);
    drone.updateMatrixWorld(true);
    windScreenPosition.copy(drone.position).project(camera);

    if (windScreenPosition.z < -1 || windScreenPosition.z > 1) {
        return;
    }

    const droneScreenX = (windScreenPosition.x * 0.5 + 0.5) * window.innerWidth;
    const droneScreenY = (-windScreenPosition.y * 0.5 + 0.5) * window.innerHeight;
    const deltaX = droneScreenX - event.clientX;
    const deltaY = droneScreenY - event.clientY;
    const distance = Math.hypot(deltaX, deltaY);
    const strength = THREE.MathUtils.clamp(distance / 260, 0.35, 1.45);

    if (distance < 4) {
        return;
    }

    injectWindPulse(deltaX, deltaY, strength);
    showWindIndicator(event.clientX, event.clientY, droneScreenX, droneScreenY, strength);
    event.preventDefault();
}

const worldPickRaycaster = new THREE.Raycaster();
const worldPickPointer = new THREE.Vector2();
const worldPickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const worldPickHit = new THREE.Vector3();
let worldPickMode = false;

function updateWorldPickUi() {
    if (toggleWorldPickButton) {
        toggleWorldPickButton.classList.toggle('active', worldPickMode);
        toggleWorldPickButton.textContent = worldPickMode ? 'Cancel World Pick' : 'Pick In World';
    }

    if (worldPickHint) {
        worldPickHint.classList.toggle('hidden', !worldPickMode);
    }
}

function setWorldPickMode(enabled) {
    worldPickMode = Boolean(enabled) && !isMobileFrontView;
    updateWorldPickUi();
}

function pickDestinationFromWorld(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    worldPickPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    worldPickPointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    worldPickRaycaster.setFromCamera(worldPickPointer, camera);

    if (!worldPickRaycaster.ray.intersectPlane(worldPickPlane, worldPickHit)) {
        return false;
    }

    const success = setAutonomousDestination(worldPickHit.x, worldPickHit.z);
    if (success) {
        setWorldPickMode(false);
    }
    return success;
}

function handleWorldPointerDown(event) {
    if (isMobileFrontView) {
        return;
    }

    if (event.button !== 0) {
        return;
    }

    if (worldPickMode) {
        event.preventDefault();
        pickDestinationFromWorld(event);
        return;
    }

    handleWindClick(event);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb7d0e8);

const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0),
});
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 30;
world.solver.tolerance = 0.0005;
world.allowSleep = false;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style.touchAction = 'none';
document.body.appendChild(renderer.domElement);

let windIndicator = null;
let windIndicatorLine = null;
let windIndicatorHead = null;
let windIndicatorLabel = null;
let windIndicatorLife = 0;
let windIndicatorAngle = 0;
let windIndicatorLength = 0;

windIndicator = document.createElement('div');
windIndicator.className = 'wind-indicator hidden';
windIndicatorLine = document.createElement('div');
windIndicatorLine.className = 'wind-indicator-line';
windIndicatorHead = document.createElement('div');
windIndicatorHead.className = 'wind-indicator-head';
windIndicatorLabel = document.createElement('div');
windIndicatorLabel.className = 'wind-indicator-label';
windIndicatorLabel.textContent = 'WIND';
windIndicator.appendChild(windIndicatorLine);
windIndicator.appendChild(windIndicatorHead);
windIndicator.appendChild(windIndicatorLabel);
document.body.appendChild(windIndicator);
if (!isMobileFrontView) {
    renderer.domElement.addEventListener('pointerdown', handleWorldPointerDown, { passive: false });
}

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 4, 8);

const droneFrontCamera = new THREE.PerspectiveCamera(76, MINI_CAM_WIDTH / MINI_CAM_HEIGHT, 0.03, 220);
droneFrontCamera.position.set(0, 0.12, -0.56);
droneFrontCamera.rotation.y = 0;
const droneFrontCameraLeft = new THREE.PerspectiveCamera(76, MINI_CAM_WIDTH / MINI_CAM_HEIGHT, 0.03, 220);
droneFrontCameraLeft.position.set(-FPV_EYE_SEPARATION * 0.5 - FPV_LEFT_EYE_SHIFT, 0.12, -0.56);
droneFrontCameraLeft.rotation.y = 0;
const droneFrontCameraRight = new THREE.PerspectiveCamera(76, MINI_CAM_WIDTH / MINI_CAM_HEIGHT, 0.03, 220);
droneFrontCameraRight.position.set(FPV_EYE_SEPARATION * 0.5 + FPV_RIGHT_EYE_SHIFT, 0.12, -0.56);
droneFrontCameraRight.rotation.y = 0;

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
drone.add(droneFrontCameraLeft);
drone.add(droneFrontCameraRight);

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
const { group: trayCoordinateSystem, ballMarker: trayBallMarker } = createTrayCoordinateSystem(traySafeHalf);
trayCoordinateSystem.position.set(0, TRAY_OFFSET_Y, 0);
drone.add(trayCoordinateSystem);
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
    linearDamping: 0.08,
    angularDamping: 0.18,
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
        friction: 0.42,
        restitution: 0.02,
        contactEquationStiffness: 1e8,
        contactEquationRelaxation: 2,
        frictionEquationStiffness: 1e8,
        frictionEquationRelaxation: 2,
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

// Autonomous Flight System
const autonomy = new AutonomySystem();
let navigationGrid = null;  // Will be initialized when environment loads
let pathVisualizationLine = null;  // 3D path line visualization
let destinationMarker = null;  // 3D destination marker
const pathVisualizationMaterial = new THREE.LineBasicMaterial({
    color: 0x39d8ff,
    transparent: true,
    opacity: 0.9,
});
const destinationMarkerGeometry = new THREE.SphereGeometry(0.13, 18, 14);
const destinationMarkerMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd35a,
    emissive: 0x5f3c00,
    emissiveIntensity: 0.92,
    transparent: true,
    opacity: 0.95,
});
let outOfTrayTime = 0;
let centerRegionRatio = CENTER_REGION_RATIO_DEFAULT;
let centerHoldActive = false;
let edgeBounceCooldown = 0;
let debugHudVisible = false;
let droneCrashed = false;
let prevGamepadYPressed = false;
let prevGamepadXPressed = false;
let prevGamepadLBPressed = false;
let prevGamepadRBPressed = false;
let correctionArrowScale = 0;
let correctionActive = false;
let environmentMode = ENV_MODE_CITY;
let mobileStereoFpvEnabled = false;
let lastMobileTapTime = 0;
const windImpulse = {
    x: 0,
    y: 0,
    z: 0,
    roll: 0,
    pitch: 0,
    yaw: 0,
};

const MIRROR_STATE_CHANNEL_NAME = 'drones-project-mirror-state';
const MIRROR_STATE_STORAGE_KEY = 'drones-project-mirror-state';
const sharedInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let mirrorStateChannel = null;
let mirrorStateSnapshot = null;

if ('BroadcastChannel' in window) {
    try {
        mirrorStateChannel = new BroadcastChannel(MIRROR_STATE_CHANNEL_NAME);
        mirrorStateChannel.onmessage = (event) => {
            const message = event.data;
            if (message?.type === 'sim-state' && message.senderId !== sharedInstanceId) {
                mirrorStateSnapshot = message.state;
            }
        };
    } catch {
        mirrorStateChannel = null;
    }
}

window.addEventListener('storage', (event) => {
    if (event.key !== MIRROR_STATE_STORAGE_KEY || !event.newValue) {
        return;
    }

    try {
        const message = JSON.parse(event.newValue);
        if (message?.type === 'sim-state' && message.senderId !== sharedInstanceId) {
            mirrorStateSnapshot = message.state;
        }
    } catch {
        // ignore malformed storage updates
    }
});

function captureMirrorState() {
    return {
        environmentMode,
        autoBalance,
        assistedMode,
        centerRegionRatio,
        trayPosition: {
            x: trayBody.position.x,
            y: trayBody.position.y,
            z: trayBody.position.z,
        },
        trayQuaternion: {
            x: trayBody.quaternion.x,
            y: trayBody.quaternion.y,
            z: trayBody.quaternion.z,
            w: trayBody.quaternion.w,
        },
        trayVelocity: {
            x: trayBody.velocity.x,
            y: trayBody.velocity.y,
            z: trayBody.velocity.z,
        },
        trayAngularVelocity: {
            x: trayBody.angularVelocity.x,
            y: trayBody.angularVelocity.y,
            z: trayBody.angularVelocity.z,
        },
        ballPosition: {
            x: ballBody.position.x,
            y: ballBody.position.y,
            z: ballBody.position.z,
        },
        ballQuaternion: {
            x: ballBody.quaternion.x,
            y: ballBody.quaternion.y,
            z: ballBody.quaternion.z,
            w: ballBody.quaternion.w,
        },
        ballVelocity: {
            x: ballBody.velocity.x,
            y: ballBody.velocity.y,
            z: ballBody.velocity.z,
        },
        movement: {
            x: movement.x,
            y: movement.y,
            z: movement.z,
            roll: movement.roll,
            pitch: movement.pitch,
            yaw: movement.yaw,
            yawRate: movement.yawRate,
        },
        targetMovement: {
            x: targetMovement.x,
            y: targetMovement.y,
            z: targetMovement.z,
            roll: targetMovement.roll,
            pitch: targetMovement.pitch,
            yawRate: targetMovement.yawRate,
        },
    };
}

function applyMirrorState(state) {
    if (!state) {
        return;
    }

    if (typeof state.environmentMode === 'string' && state.environmentMode !== environmentMode) {
        environmentMode = state.environmentMode;
        applyEnvironmentMode();
    }

    if (typeof state.autoBalance === 'boolean') {
        autoBalance = state.autoBalance;
    }
    if (typeof state.assistedMode === 'boolean') {
        assistedMode = state.assistedMode;
    }
    if (typeof state.centerRegionRatio === 'number') {
        centerRegionRatio = THREE.MathUtils.clamp(state.centerRegionRatio, CENTER_REGION_RATIO_MIN, CENTER_REGION_RATIO_MAX);
        updateCenterRegionUi(true);
    }

    if (state.trayPosition) {
        trayBody.position.set(state.trayPosition.x, state.trayPosition.y, state.trayPosition.z);
    }
    if (state.trayQuaternion) {
        trayBody.quaternion.set(
            state.trayQuaternion.x,
            state.trayQuaternion.y,
            state.trayQuaternion.z,
            state.trayQuaternion.w
        );
    }
    if (state.trayVelocity) {
        trayBody.velocity.set(state.trayVelocity.x, state.trayVelocity.y, state.trayVelocity.z);
    }
    if (state.trayAngularVelocity) {
        trayBody.angularVelocity.set(
            state.trayAngularVelocity.x,
            state.trayAngularVelocity.y,
            state.trayAngularVelocity.z
        );
    }

    if (state.ballPosition) {
        ballBody.position.set(state.ballPosition.x, state.ballPosition.y, state.ballPosition.z);
    }
    if (state.ballQuaternion) {
        ballBody.quaternion.set(
            state.ballQuaternion.x,
            state.ballQuaternion.y,
            state.ballQuaternion.z,
            state.ballQuaternion.w
        );
    }
    if (state.ballVelocity) {
        ballBody.velocity.set(state.ballVelocity.x, state.ballVelocity.y, state.ballVelocity.z);
    }

    if (state.movement) {
        movement.x = state.movement.x ?? movement.x;
        movement.y = state.movement.y ?? movement.y;
        movement.z = state.movement.z ?? movement.z;
        movement.roll = state.movement.roll ?? movement.roll;
        movement.pitch = state.movement.pitch ?? movement.pitch;
        movement.yaw = state.movement.yaw ?? movement.yaw;
        movement.yawRate = state.movement.yawRate ?? movement.yawRate;
    }

    if (state.targetMovement) {
        targetMovement.x = state.targetMovement.x ?? targetMovement.x;
        targetMovement.y = state.targetMovement.y ?? targetMovement.y;
        targetMovement.z = state.targetMovement.z ?? targetMovement.z;
        targetMovement.roll = state.targetMovement.roll ?? targetMovement.roll;
        targetMovement.pitch = state.targetMovement.pitch ?? targetMovement.pitch;
        targetMovement.yawRate = state.targetMovement.yawRate ?? targetMovement.yawRate;
    }
}

function publishMirrorState() {
    const payload = captureMirrorState();

    mirrorStateSnapshot = payload;

    if (mirrorStateChannel) {
        try {
            mirrorStateChannel.postMessage({
                type: 'sim-state',
                senderId: sharedInstanceId,
                state: payload,
            });
        } catch {
            // ignore broadcast failures
        }
    }

    try {
        localStorage.setItem(MIRROR_STATE_STORAGE_KEY, JSON.stringify({ type: 'sim-state', state: payload }));
    } catch {
        // ignore storage failures
    }
}

window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && destinationModal && !destinationModal.classList.contains('hidden')) {
        closeDestinationModal();
        return;
    }
    if (event.code === 'Escape' && worldPickMode) {
        setWorldPickMode(false);
        return;
    }
    if (event.code === 'KeyB') {
        autoBalance = !autoBalance;
    }
    if (event.code === 'KeyG') {
        assistedMode = !assistedMode;
        if (!assistedMode) {
            centerHoldActive = false;
            correctionActive = false;
            correctionArrow.visible = false;
            correctionArrowScale = 0;
            correctionArrow.scale.setScalar(0.001);
            assistPulseTilt.roll = 0;
            assistPulseTilt.pitch = 0;
            assistPulseCycle.rollOn = false;
            assistPulseCycle.pitchOn = false;
            assistPulseCycle.rollTimer = 0;
            assistPulseCycle.pitchTimer = 0;
            targetMovement.roll = 0;
            targetMovement.pitch = 0;
            targetMovement.x = 0;
            targetMovement.z = 0;
        }
    }
    if (event.code === 'KeyT') {
        toggleEnvironmentMode();
    }
    if (event.code === 'KeyN') {
        openDestinationModal();
    }
    if (event.code === 'KeyM') {
        setWorldPickMode(!worldPickMode);
    }
    if (event.code === 'KeyL') {
        autonomy.setEnabled(!autonomy.enabled);
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
    mobileUrl: document.getElementById('tm-mobile-url'),
    mode: document.getElementById('tm-mode'),
    assisted: document.getElementById('tm-assisted'),
    environment: document.getElementById('tm-env'),
    autonomy: document.getElementById('tm-autonomy'),
    destination: document.getElementById('tm-destination'),
    pathStatus: document.getElementById('tm-path-status'),
    frontDistance: document.getElementById('tm-front-distance'),
    ballInTray: document.getElementById('tm-ball-in-tray'),
    ballInCenter: document.getElementById('tm-center'),
    ballLocal: document.getElementById('tm-ball-local'),
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
const overlayTitle = overlay ? overlay.querySelector('.overlay-card h2') : null;
const resetButton = document.getElementById('reset-btn');
const debugHud = document.getElementById('debug-hud');
const gameHud = document.getElementById('game-hud');
const miniCamFrame = document.getElementById('mini-cam-frame');
const mobileViewUrl = document.getElementById('mobile-view-url');
const compass = document.getElementById('compass');
const compassTape = document.getElementById('compass-tape');
const compassHeading = document.getElementById('compass-heading');
const keyboardGlyphs = document.getElementById('keyboard-glyphs');
const gamepadGlyphs = document.getElementById('gamepad-glyphs');
const activeInputLabel = document.getElementById('active-input-label');
const fpvDivider = document.getElementById('fpv-divider');
const vrMask = document.getElementById('vr-mask');
const miniMapCanvas = document.getElementById('mini-map-canvas');
const miniMapContext = miniMapCanvas ? miniMapCanvas.getContext('2d') : null;
const destinationModal = document.getElementById('destination-modal');
const destinationXInput = document.getElementById('dest-x');
const destinationZInput = document.getElementById('dest-z');
const openDestinationButton = document.getElementById('open-destination-modal');
const toggleWorldPickButton = document.getElementById('toggle-world-pick');
const clearDestinationButton = document.getElementById('clear-destination');
const worldPickHint = document.getElementById('world-pick-hint');
const gameTelemetry = {
    mode: document.getElementById('gh-mode'),
    assisted: document.getElementById('gh-assisted'),
    environment: document.getElementById('gh-env'),
    autonomy: document.getElementById('gh-autonomy'),
    destination: document.getElementById('gh-destination'),
    pathStatus: document.getElementById('gh-path-status'),
    frontDistance: document.getElementById('gh-front-distance'),
    altitude: document.getElementById('gh-altitude'),
    speed: document.getElementById('gh-speed'),
    ballInTray: document.getElementById('gh-ball-in-tray'),
    ballInCenter: document.getElementById('gh-center'),
    ballLocal: document.getElementById('gh-ball-local'),
};
const attitudeEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const trayToWorldQuat = new THREE.Quaternion();
const worldToTrayQuat = new THREE.Quaternion();
const ballOffsetWorld = new THREE.Vector3();
const relativeVelocityWorld = new THREE.Vector3();
const ballLocalPosition = new THREE.Vector3();
const ballLocalVelocity = new THREE.Vector3();
const ballLocalCoordinates = new THREE.Vector2();
const correctionArrowOffset = new THREE.Vector3(0.9, 0.65, 0.35);
const correctionArrowWorldPos = new THREE.Vector3();
const correctionArrowTargetDir = new THREE.Vector3(1, 0, 0);
const correctionArrowDirection = new THREE.Vector3(1, 0, 0);
const correctionUpAxis = new THREE.Vector3(0, 1, 0);
const frontSensorOrigin = new THREE.Vector3();
const frontSensorDirection = new THREE.Vector3();
const minimapPoint = new THREE.Vector2();

function ensureNavigationGrid() {
    if (!navigationGrid) {
        initializeNavigationGrid();
    }
    return navigationGrid;
}

function findBestDestinationPoint(targetX, targetZ) {
    const grid = ensureNavigationGrid();
    if (!grid) {
        return null;
    }

    if (grid.isPointWalkable(targetX, targetZ)) {
        return { x: targetX, z: targetZ };
    }

    const nearestCell = grid.findNearestWalkable(targetX, targetZ, 12);
    if (!nearestCell) {
        return null;
    }

    return grid.gridToWorld(nearestCell.ix, nearestCell.iz);
}

function clearAutonomousRoute() {
    setWorldPickMode(false);
    autonomy.clearRoute(false);
    autonomy.setEnabled(false);
    clearPathVisualization();
}

function setAutonomousDestination(destX, destZ) {
    const resolvedDestination = findBestDestinationPoint(destX, destZ);
    if (!resolvedDestination) {
        alert('No reachable destination was found there. Try another point on the map.');
        return false;
    }

    const error = autonomy.setDestination(resolvedDestination.x, resolvedDestination.z, navigationGrid);
    if (error) {
        alert(`Unable to set destination: ${error}`);
        return false;
    }

    autonomy.setEnabled(true);
    autonomy.planPath(trayBody.position.x, trayBody.position.z, navigationGrid);

    if (autonomy.waypointPath.length === 0 && !autonomy.isDestinationReached()) {
        alert(autonomy.lastPlanError || 'No valid route could be planned to that point.');
        return false;
    }

    updatePathVisualization();
    return true;
}

function drawMiniMap() {
    if (!miniMapCanvas || !miniMapContext) {
        return;
    }

    if (miniMapCanvas.width !== MINIMAP_SIZE || miniMapCanvas.height !== MINIMAP_SIZE) {
        miniMapCanvas.width = MINIMAP_SIZE;
        miniMapCanvas.height = MINIMAP_SIZE;
    }

    const context = miniMapContext;
    const width = miniMapCanvas.width;
    const height = miniMapCanvas.height;
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const radius = Math.min(width, height) * 0.48;
    const pixelsPerMeter = radius / MINIMAP_RANGE;

    context.clearRect(0, 0, width, height);

    context.save();
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.clip();

    const gradient = context.createRadialGradient(centerX, centerY, radius * 0.15, centerX, centerY, radius);
    gradient.addColorStop(0, 'rgba(20, 66, 84, 0.95)');
    gradient.addColorStop(1, 'rgba(8, 20, 28, 0.98)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = 'rgba(160, 230, 255, 0.18)';
    context.lineWidth = 1;
    const ringSteps = [0.33, 0.66, 1];
    for (let index = 0; index < ringSteps.length; index += 1) {
        context.beginPath();
        context.arc(centerX, centerY, radius * ringSteps[index], 0, Math.PI * 2);
        context.stroke();
    }

    context.strokeStyle = 'rgba(180, 230, 255, 0.2)';
    context.beginPath();
    context.moveTo(centerX - radius, centerY);
    context.lineTo(centerX + radius, centerY);
    context.moveTo(centerX, centerY - radius);
    context.lineTo(centerX, centerY + radius);
    context.stroke();

    const droneX = trayBody.position.x;
    const droneZ = trayBody.position.z;

    let drawnObstacles = 0;
    for (let index = 0; index < activeObstacleColliders.length; index += 1) {
        if (drawnObstacles >= MINIMAP_OBSTACLE_LIMIT) {
            break;
        }

        const obstacle = activeObstacleColliders[index];
        const offsetX = obstacle.x - droneX;
        const offsetZ = obstacle.z - droneZ;
        const planarDistance = Math.hypot(offsetX, offsetZ);
        if (planarDistance > MINIMAP_RANGE + Math.max(obstacle.hx, obstacle.hz)) {
            continue;
        }

        minimapPoint.set(offsetX, offsetZ).multiplyScalar(pixelsPerMeter);
        const drawX = centerX + minimapPoint.x;
        const drawY = centerY + minimapPoint.y;
        const obstacleW = Math.max(2, obstacle.hx * 2 * pixelsPerMeter);
        const obstacleH = Math.max(2, obstacle.hz * 2 * pixelsPerMeter);

        if (environmentMode === ENV_MODE_CITY) {
            context.fillStyle = 'rgba(183, 214, 238, 0.74)';
            context.fillRect(drawX - obstacleW * 0.5, drawY - obstacleH * 0.5, obstacleW, obstacleH);
        } else {
            context.fillStyle = 'rgba(168, 198, 146, 0.72)';
            context.beginPath();
            context.ellipse(drawX, drawY, obstacleW * 0.58, obstacleH * 0.58, 0, 0, Math.PI * 2);
            context.fill();
        }

        drawnObstacles += 1;
    }

    const destination = autonomy.getDestination();
    const waypointPath = autonomy.getWaypointPath();
    if (autonomy.enabled && autonomy.hasDestination && destination && waypointPath.length > 0) {
        context.strokeStyle = 'rgba(57, 216, 255, 0.9)';
        context.fillStyle = 'rgba(255, 211, 90, 0.95)';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(centerX, centerY);

        for (let index = 0; index < waypointPath.length; index += 1) {
            const point = waypointPath[index];
            const offsetX = point.x - droneX;
            const offsetZ = point.z - droneZ;
            minimapPoint.set(offsetX, offsetZ).multiplyScalar(pixelsPerMeter);
            context.lineTo(centerX + minimapPoint.x, centerY + minimapPoint.y);
        }

        context.stroke();

        const destinationOffsetX = destination.x - droneX;
        const destinationOffsetZ = destination.z - droneZ;
        minimapPoint.set(destinationOffsetX, destinationOffsetZ).multiplyScalar(pixelsPerMeter);
        context.beginPath();
        context.arc(centerX + minimapPoint.x, centerY + minimapPoint.y, 4, 0, Math.PI * 2);
        context.fill();
    }

    context.restore();

    context.strokeStyle = 'rgba(196, 238, 255, 0.5)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();

    context.save();
    context.translate(centerX, centerY);
    context.rotate(-movement.yaw);
    context.fillStyle = 'rgba(255, 215, 122, 0.95)';
    context.beginPath();
    context.moveTo(0, -12);
    context.lineTo(8, 10);
    context.lineTo(0, 5);
    context.lineTo(-8, 10);
    context.closePath();
    context.fill();
    context.restore();

    context.fillStyle = 'rgba(220, 245, 255, 0.9)';
    context.font = '11px Arial';
    context.textAlign = 'left';
    context.fillText(`${Math.round(MINIMAP_RANGE)}m`, 10, height - 10);
}

function createTrayCoordinateSystem(axisHalfSize) {
    const group = new THREE.Group();
    group.name = 'tray-coordinate-system';

    const axisMaterialX = new THREE.LineBasicMaterial({ color: 0xff5e5e, transparent: true, opacity: 0.9 });
    const axisMaterialZ = new THREE.LineBasicMaterial({ color: 0x53c7ff, transparent: true, opacity: 0.9 });
    const centerMaterial = new THREE.MeshStandardMaterial({
        color: 0x7dff9f,
        emissive: 0x12341c,
        emissiveIntensity: 0.75,
        transparent: true,
        opacity: 0.95,
    });

    const axisLength = axisHalfSize * 0.96;
    const axisYOffset = 0.021;

    const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-axisLength, axisYOffset, 0),
        new THREE.Vector3(axisLength, axisYOffset, 0),
    ]);
    const zAxisGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, axisYOffset, -axisLength),
        new THREE.Vector3(0, axisYOffset, axisLength),
    ]);

    const xAxis = new THREE.Line(xAxisGeometry, axisMaterialX);
    const zAxis = new THREE.Line(zAxisGeometry, axisMaterialZ);

    const centerDot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 18), centerMaterial);
    centerDot.rotation.x = Math.PI * 0.5;
    centerDot.position.y = axisYOffset + 0.004;

    const ballMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 16, 12),
        new THREE.MeshStandardMaterial({
            color: 0xffd35a,
            emissive: 0x5f3c00,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.95,
        })
    );
    ballMarker.position.y = axisYOffset + 0.028;

    group.add(xAxis);
    group.add(zAxis);
    group.add(centerDot);
    group.add(ballMarker);

    return { group, ballMarker };
}

function clearPathVisualization() {
    if (pathVisualizationLine) {
        scene.remove(pathVisualizationLine);
        pathVisualizationLine.geometry.dispose();
        pathVisualizationLine = null;
    }

    if (destinationMarker) {
        scene.remove(destinationMarker);
        destinationMarker = null;
    }
}

function updatePathVisualization() {
    const destination = autonomy.getDestination();
    const waypointPath = autonomy.getWaypointPath();
    const hasActivePath = autonomy.enabled && autonomy.hasDestination && destination && waypointPath.length > 0;

    if (!hasActivePath) {
        clearPathVisualization();
        return;
    }

    const pathPoints = [
        new THREE.Vector3(trayBody.position.x, trayBody.position.y + 0.12, trayBody.position.z),
        ...waypointPath.map((point) => new THREE.Vector3(point.x, trayBody.position.y + 0.12, point.z)),
    ];
    const pathSignature = pathPoints
        .map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)},${point.z.toFixed(2)}`)
        .join('|');

    if (!pathVisualizationLine) {
        pathVisualizationLine = new THREE.Line(new THREE.BufferGeometry(), pathVisualizationMaterial);
        pathVisualizationLine.frustumCulled = false;
        scene.add(pathVisualizationLine);
    }

    if (pathVisualizationLine.userData.signature !== pathSignature) {
        pathVisualizationLine.geometry.dispose();
        pathVisualizationLine.geometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
        pathVisualizationLine.userData.signature = pathSignature;
    }

    if (!destinationMarker) {
        destinationMarker = new THREE.Mesh(destinationMarkerGeometry, destinationMarkerMaterial);
        destinationMarker.frustumCulled = false;
        scene.add(destinationMarker);
    }

    destinationMarker.position.set(destination.x, trayBody.position.y + 0.16, destination.z);
}

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

function isPrivateIpv4(ip) {
    return /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
}

async function detectLanIpv4() {
    if (!window.RTCPeerConnection) {
        return null;
    }

    return new Promise((resolve) => {
        const peer = new RTCPeerConnection({ iceServers: [] });
        const found = new Set();
        let settled = false;

        function settle(value) {
            if (!settled) {
                settled = true;
                try {
                    peer.close();
                } catch {
                    // no-op
                }
                resolve(value);
            }
        }

        peer.createDataChannel('lan-ip-discovery');

        peer.onicecandidate = (event) => {
            const candidate = event.candidate?.candidate;
            if (!candidate) {
                const lan = Array.from(found).find(isPrivateIpv4) ?? null;
                settle(lan);
                return;
            }

            const match = candidate.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
            if (match) {
                found.add(match[1]);
                if (isPrivateIpv4(match[1])) {
                    settle(match[1]);
                }
            }
        };

        peer.createOffer()
            .then((offer) => peer.setLocalDescription(offer))
            .catch(() => settle(null));

        setTimeout(() => {
            const lan = Array.from(found).find(isPrivateIpv4) ?? null;
            settle(lan);
        }, 1400);
    });
}

async function updateMobileViewAddressDisplay() {
    if (isMobileFrontView) {
        return;
    }

    const currentPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    const hostname = window.location.hostname;
    let urlText = '';

    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        urlText = `${window.location.protocol}//${hostname}:${currentPort}/mobile.html`;
    } else {
        const lanIp = await detectLanIpv4();
        if (lanIp) {
            urlText = `${window.location.protocol}//${lanIp}:${currentPort}/mobile.html`;
        } else {
            urlText = `Open using your PC LAN IP on port ${currentPort}: /mobile.html`;
        }
    }

    if (mobileViewUrl) {
        mobileViewUrl.textContent = `Mobile View: ${urlText}`;
    }
    if (telemetry.mobileUrl) {
        telemetry.mobileUrl.textContent = urlText;
    }
}

const windScreenPosition = new THREE.Vector3();

function injectWindPulse(deltaX, deltaY, intensity = 1) {
    const dragMagnitude = Math.hypot(deltaX, deltaY);
    const pulseStrength = THREE.MathUtils.clamp(dragMagnitude / 140, 0, 1.5) * intensity;

    if (pulseStrength <= 0) {
        return;
    }

    const dirX = deltaX / dragMagnitude;
    const dirY = deltaY / dragMagnitude;
    const sideGust = dirX * pulseStrength * WIND_FORCE_GAIN * 72;
    const forwardGust = dirY * pulseStrength * WIND_FORCE_GAIN * 72;
    const verticalGust = dirY * pulseStrength * WIND_VERTICAL_GAIN * 20;
    const rollGust = (Math.random() - 0.5) * pulseStrength * WIND_TILT_GAIN * 54;
    const pitchGust = (Math.random() - 0.5) * pulseStrength * WIND_TILT_GAIN * 54;
    const yawGust = (Math.random() - 0.5) * pulseStrength * WIND_TILT_GAIN * 28;

    windImpulse.x = THREE.MathUtils.clamp(windImpulse.x + sideGust, -WIND_MAX_FORCE, WIND_MAX_FORCE);
    windImpulse.z = THREE.MathUtils.clamp(windImpulse.z + forwardGust, -WIND_MAX_FORCE, WIND_MAX_FORCE);
    windImpulse.y = THREE.MathUtils.clamp(windImpulse.y + verticalGust, -WIND_MAX_FORCE * 0.5, WIND_MAX_FORCE * 0.5);
    windImpulse.roll = THREE.MathUtils.clamp(windImpulse.roll + rollGust, -WIND_MAX_TILT, WIND_MAX_TILT);
    windImpulse.pitch = THREE.MathUtils.clamp(windImpulse.pitch + pitchGust, -WIND_MAX_TILT, WIND_MAX_TILT);
    windImpulse.yaw = THREE.MathUtils.clamp(windImpulse.yaw + yawGust, -WIND_MAX_YAW, WIND_MAX_YAW);
}

function updateWindImpulse() {
    windImpulse.x *= WIND_PULSE_DECAY;
    windImpulse.y *= WIND_PULSE_DECAY;
    windImpulse.z *= WIND_PULSE_DECAY;
    windImpulse.roll *= WIND_PULSE_DECAY;
    windImpulse.pitch *= WIND_PULSE_DECAY;
    windImpulse.yaw *= WIND_PULSE_DECAY;

    if (Math.abs(windImpulse.x) < WIND_PULSE_MIN) windImpulse.x = 0;
    if (Math.abs(windImpulse.y) < WIND_PULSE_MIN) windImpulse.y = 0;
    if (Math.abs(windImpulse.z) < WIND_PULSE_MIN) windImpulse.z = 0;
    if (Math.abs(windImpulse.roll) < WIND_PULSE_MIN) windImpulse.roll = 0;
    if (Math.abs(windImpulse.pitch) < WIND_PULSE_MIN) windImpulse.pitch = 0;
    if (Math.abs(windImpulse.yaw) < WIND_PULSE_MIN) windImpulse.yaw = 0;
}

function updateWindIndicator() {
    if (!windIndicator) {
        return;
    }

    if (windIndicatorLife <= 0) {
        windIndicator.classList.add('hidden');
        return;
    }

    windIndicatorLife = Math.max(0, windIndicatorLife - 0.045);
    const fade = windIndicatorLife * windIndicatorLife;
    windIndicator.style.opacity = `${fade}`;
    windIndicator.classList.toggle('hidden', windIndicatorLife <= 0.01);

    if (windIndicatorLine) {
        windIndicatorLine.style.width = `${Math.max(24, windIndicatorLength - 18)}px`;
    }
    if (windIndicatorHead) {
        windIndicatorHead.style.left = `${Math.max(14, windIndicatorLength - 18)}px`;
    }
    if (windIndicatorLabel) {
        windIndicatorLabel.style.transform = `translate(-50%, -50%) rotate(${-windIndicatorAngle}rad)`;
    }
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

function initializeNavigationGrid() {
    // Create navigation grid for A* pathfinding
    navigationGrid = new NavigationGrid(-120, 120, -120, 120, 2.0);

    // Convert obstacle bodies to collider objects
    const colliders = activeObstacleColliders
        .filter(collider => collider && typeof collider.x === 'number' && typeof collider.z === 'number')
        .map(collider => ({
            x: collider.x,
            z: collider.z,
            hx: collider.hx,
            hz: collider.hz,
        }));

    navigationGrid.markObstacles(colliders, 0.8);
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

    // Reinitialize navigation grid for pathfinding
    initializeNavigationGrid();

    // If autonomous is active with path, replan
    if (autonomy.enabled && autonomy.hasDestination) {
        autonomy.planPath(trayBody.position.x, trayBody.position.z, navigationGrid);
    }
}

function toggleEnvironmentMode() {
    environmentMode = environmentMode === ENV_MODE_CITY ? ENV_MODE_MOUNTAIN : ENV_MODE_CITY;
    applyEnvironmentMode();
}

applyEnvironmentMode();
updateMobileViewAddressDisplay();
initializeAutonomousUI();

function toggleMobileStereoFpv() {
    if (!isMobileFrontView) {
        return;
    }

    mobileStereoFpvEnabled = !mobileStereoFpvEnabled;

    document.body.classList.toggle('stereo-fpv', mobileStereoFpvEnabled);

    if (fpvDivider) {
        fpvDivider.classList.toggle('hidden', !mobileStereoFpvEnabled);
    }

    if (vrMask) {
        vrMask.classList.toggle('hidden', !mobileStereoFpvEnabled);
    }
}

if (isMobileFrontView) {
    document.body.classList.toggle('stereo-fpv', mobileStereoFpvEnabled);
    if (vrMask) {
        vrMask.classList.toggle('hidden', !mobileStereoFpvEnabled);
    }
    window.addEventListener('dblclick', toggleMobileStereoFpv);
    window.addEventListener('touchend', () => {
        const now = performance.now();
        if (now - lastMobileTapTime <= DOUBLE_TAP_MAX_DELAY) {
            toggleMobileStereoFpv();
            lastMobileTapTime = 0;
        } else {
            lastMobileTapTime = now;
        }
    }, { passive: true });
}

if (isMobileFrontView) {
    try {
        const savedState = localStorage.getItem(MIRROR_STATE_STORAGE_KEY);
        if (savedState) {
            const message = JSON.parse(savedState);
            if (message?.type === 'sim-state' && message.state) {
                mirrorStateSnapshot = message.state;
                applyMirrorState(mirrorStateSnapshot);
            }
        }
    } catch {
        // ignore restore failures
    }
}

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
    ballLocalCoordinates.set(ballLocalPosition.x, ballLocalPosition.z);
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

function computeCenteringTranslation(position, velocity, edgeRatio, inCenterRegion) {
    const predictedPosition = position + velocity * ASSIST_CENTER_LOOKAHEAD;
    const captureBoost = inCenterRegion ? ASSIST_CENTER_CAPTURE_BOOST : 1;
    const rawCorrection =
        predictedPosition * ASSIST_CENTER_TRANSLATION_P * captureBoost +
        velocity * ASSIST_CENTER_TRANSLATION_D;
    const brakingBias = Math.sign(velocity) * Math.min(Math.abs(velocity) * ASSIST_CENTER_BRAKE_GAIN, 0.18);
    const adaptiveMax = THREE.MathUtils.lerp(
        ASSIST_CENTER_TRANSLATION_MAX * 0.72,
        ASSIST_CENTER_TRANSLATION_MAX,
        edgeRatio
    );
    return THREE.MathUtils.clamp(rawCorrection + brakingBias, -adaptiveMax, adaptiveMax);
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
    const autonomyEnabledText = autonomy.enabled ? 'ON' : 'OFF';
    const destinationText = autonomy.hasDestination
        ? `(${autonomy.destinationX.toFixed(1)}, ${autonomy.destinationZ.toFixed(1)})`
        : '--';
    const pathStatusText = !autonomy.enabled
        ? 'DISABLED'
        : autonomy.isPlanning
            ? 'PLANNING'
            : autonomy.lastPlanError
                ? 'NO ROUTE'
                : autonomy.hasDestination
                    ? `${autonomy.waypointPath.length} WAYPOINTS${autonomy.isDestinationReached() ? ' - ARRIVED' : ''}`
                    : 'READY';

    telemetry.mode.textContent = autoBalance ? 'AUTO-BAL' : 'MANUAL';
    telemetry.assisted.textContent = assistedMode ? 'ON' : 'OFF';
    if (telemetry.environment) {
        telemetry.environment.textContent = getEnvironmentLabel();
    }
    if (telemetry.frontDistance) {
        telemetry.frontDistance.textContent = frontDistanceText;
    }
    if (telemetry.autonomy) {
        telemetry.autonomy.textContent = autonomyEnabledText;
    }
    if (telemetry.destination) {
        telemetry.destination.textContent = destinationText;
    }
    if (telemetry.pathStatus) {
        telemetry.pathStatus.textContent = pathStatusText;
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
    if (telemetry.ballLocal) {
        telemetry.ballLocal.textContent = `(${ballLocalCoordinates.x.toFixed(2)}, ${ballLocalCoordinates.y.toFixed(2)})`;
    }

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
        if (gameTelemetry.autonomy) {
            gameTelemetry.autonomy.textContent = autonomyEnabledText;
        }
        if (gameTelemetry.destination) {
            gameTelemetry.destination.textContent = destinationText;
        }
        if (gameTelemetry.pathStatus) {
            gameTelemetry.pathStatus.textContent = pathStatusText;
        }
        gameTelemetry.altitude.textContent = `${drone.position.y.toFixed(2)} m`;
        gameTelemetry.speed.textContent = `${speed.toFixed(2)} m/s`;
        gameTelemetry.ballInTray.textContent = ballInside ? 'YES' : 'NO';
        gameTelemetry.ballInCenter.textContent = ballInCenter ? 'YES' : 'NO';
        gameTelemetry.ballInTray.classList.toggle('status-good', ballInside);
        gameTelemetry.ballInTray.classList.toggle('status-bad', !ballInside);
        gameTelemetry.ballInCenter.classList.toggle('status-good', ballInCenter);
        gameTelemetry.ballInCenter.classList.toggle('status-bad', !ballInCenter);
        if (gameTelemetry.ballLocal) {
            gameTelemetry.ballLocal.textContent = `(${ballLocalCoordinates.x.toFixed(2)}, ${ballLocalCoordinates.y.toFixed(2)})`;
        }
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

function setOverlayMessage(message) {
    if (overlayTitle) {
        overlayTitle.textContent = message;
    }
}

function setTrayKinematic() {
    trayBody.type = CANNON.Body.KINEMATIC;
    trayBody.mass = 0;
    trayBody.linearDamping = 0;
    trayBody.angularDamping = 0;
    trayBody.updateMassProperties();
}

function setTrayDynamic() {
    trayBody.type = CANNON.Body.DYNAMIC;
    trayBody.mass = 6.5;
    trayBody.linearDamping = 0.22;
    trayBody.angularDamping = 0.35;
    trayBody.updateMassProperties();
    trayBody.wakeUp();
}

function triggerDroneCrash(impactVelocityX = 0, impactVelocityY = 0, impactVelocityZ = 0) {
    if (droneCrashed) {
        return;
    }

    droneCrashed = true;
    autoBalance = false;
    assistedMode = false;
    centerHoldActive = false;
    correctionActive = false;
    correctionArrow.visible = false;
    correctionArrowScale = 0;
    correctionArrow.scale.setScalar(0.001);
    assistPulseTilt.roll = 0;
    assistPulseTilt.pitch = 0;
    assistPulseCycle.rollOn = false;
    assistPulseCycle.pitchOn = false;
    assistPulseCycle.rollTimer = 0;
    assistPulseCycle.pitchTimer = 0;
    windImpulse.x = 0;
    windImpulse.y = 0;
    windImpulse.z = 0;
    windImpulse.roll = 0;
    windImpulse.pitch = 0;
    windImpulse.yaw = 0;

    autonomy.reset();
    clearPathVisualization();

    setTrayDynamic();
    trayBody.velocity.set(impactVelocityX, Math.min(-0.8, impactVelocityY - 1.6), impactVelocityZ);
    trayBody.angularVelocity.set(
        THREE.MathUtils.clamp(-impactVelocityZ * 0.28, -2.4, 2.4),
        THREE.MathUtils.clamp(impactVelocityX * 0.18, -2.0, 2.0),
        THREE.MathUtils.clamp(impactVelocityX * 0.24, -2.4, 2.4)
    );
    setOverlayMessage('The drone crashed');
    setOverlayVisible(true);
}

function resetSimulation() {
    droneCrashed = false;
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
    setTrayKinematic();

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
    windImpulse.x = 0;
    windImpulse.y = 0;
    windImpulse.z = 0;
    windImpulse.roll = 0;
    windImpulse.pitch = 0;
    windImpulse.yaw = 0;
    autonomy.reset();
    clearPathVisualization();
    setOverlayMessage('The ball is out of the tray');
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

function applyCenterLockAssist() {
    if (!assistedMode) {
        return;
    }

    const centerRegionHalf = getCenterRegionHalfSize();
    if (!isBallInCenterRegion(centerRegionHalf)) {
        return;
    }

    const planarSpeed = Math.hypot(ballLocalVelocity.x, ballLocalVelocity.z);
    const closeEnoughToCapture =
        planarSpeed <= CENTER_LOCK_SPEED &&
        Math.abs(ballLocalPosition.x) <= centerRegionHalf + CENTER_LOCK_TRANSLATION &&
        Math.abs(ballLocalPosition.z) <= centerRegionHalf + CENTER_LOCK_TRANSLATION;

    if (!closeEnoughToCapture) {
        return;
    }

    const desiredLocalVelocityX = THREE.MathUtils.clamp(
        (-ballLocalPosition.x * CENTER_LOCK_POSITION_GAIN) - (ballLocalVelocity.x * CENTER_LOCK_VELOCITY_GAIN),
        -CENTER_LOCK_MAX_VELOCITY,
        CENTER_LOCK_MAX_VELOCITY
    );
    const desiredLocalVelocityZ = THREE.MathUtils.clamp(
        (-ballLocalPosition.z * CENTER_LOCK_POSITION_GAIN) - (ballLocalVelocity.z * CENTER_LOCK_VELOCITY_GAIN),
        -CENTER_LOCK_MAX_VELOCITY,
        CENTER_LOCK_MAX_VELOCITY
    );

    ballLocalVelocity.x = THREE.MathUtils.lerp(ballLocalVelocity.x, desiredLocalVelocityX, 1 - CENTER_LOCK_DAMPING);
    ballLocalVelocity.z = THREE.MathUtils.lerp(ballLocalVelocity.z, desiredLocalVelocityZ, 1 - CENTER_LOCK_DAMPING);

    if (Math.abs(ballLocalPosition.x) < CENTER_LOCK_SNAP_POSITION && Math.abs(ballLocalVelocity.x) < CENTER_LOCK_SNAP_VELOCITY) {
        ballLocalVelocity.x = 0;
    }
    if (Math.abs(ballLocalPosition.z) < CENTER_LOCK_SNAP_POSITION && Math.abs(ballLocalVelocity.z) < CENTER_LOCK_SNAP_VELOCITY) {
        ballLocalVelocity.z = 0;
    }

    const worldVelocity = ballLocalVelocity.clone().applyQuaternion(trayToWorldQuat);
    worldVelocity.x += trayBody.velocity.x;
    worldVelocity.y += trayBody.velocity.y;
    worldVelocity.z += trayBody.velocity.z;
    ballBody.velocity.set(worldVelocity.x, worldVelocity.y, worldVelocity.z);
    ballBody.angularVelocity.set(0, 0, 0);
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
    autonomy.updatePilotOverride({
        roll: input.roll,
        pitch: input.pitch,
        moveX: input.moveX,
        moveZ: input.moveZ,
        yaw: input.yaw,
        throttle: input.throttle,
    });

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

            targetMovement.roll = forwardStickOverride ? 0 : THREE.MathUtils.clamp(effectiveRollInput * TILT_LIMIT * 0.78, -TILT_LIMIT, TILT_LIMIT);
            targetMovement.pitch = THREE.MathUtils.clamp(-effectivePitchInput * TILT_LIMIT * 0.78, -TILT_LIMIT, TILT_LIMIT);
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
            targetMovement.roll = 0;
            targetMovement.pitch = 0;
        } else {
            targetMovement.roll = THREE.MathUtils.clamp(effectiveRollInput * TILT_LIMIT * 0.8, -TILT_LIMIT, TILT_LIMIT);
            targetMovement.pitch = THREE.MathUtils.clamp(-effectivePitchInput * TILT_LIMIT * 0.8, -TILT_LIMIT, TILT_LIMIT);
        }
    }

    let forwardCommand = input.moveZ * MOVE_SPEED;
    let rightCommand = input.moveX * MOVE_SPEED;

    const forwardFromPitch = effectivePitchInput * MOVE_SPEED * PITCH_ROLL_MOVE_GAIN;
    const rightFromRoll = pitchDominantInput ? 0 : -effectiveRollInput * MOVE_SPEED * PITCH_ROLL_MOVE_GAIN;
    forwardCommand += forwardFromPitch;
    rightCommand += rightFromRoll;

    if (assistedMode && !centerHoldActive && !forwardStickOverride && pilotPlanarNeutral) {
        if (inCenterRegion) {
            rightCommand = 0;
            forwardCommand = 0;
            targetMovement.x = 0;
            targetMovement.z = 0;
        } else {
            const centerRight = computeCenteringTranslation(ballLocalPosition.x, ballLocalVelocity.x, edgeRatio, inCenterRegion);
            const centerForward = computeCenteringTranslation(ballLocalPosition.z, ballLocalVelocity.z, edgeRatio, inCenterRegion);
            let centerScale = pilotPlanarNeutral ? 1.35 : 0;
            if (!pilotPlanarNeutral) {
                const edgeRescueWeight = THREE.MathUtils.clamp((edgeRatio - EDGE_RESCUE_START) / (1 - EDGE_RESCUE_START), 0, 1);
                centerScale = edgeRescueWeight * 0.9;
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

    const autonomyWeight = autonomy.enabled && autonomy.hasDestination && autonomy.waypointPath.length > 0
        ? THREE.MathUtils.clamp(1 - autonomy.overrideBlendFactor, 0, 1)
        : 0;
    const autonomyActive = autonomyWeight > 0;

    if (autonomyActive) {
        const autonomousCommands = autonomy.calculateMovementCommands(
            trayBody.position.x,
            trayBody.position.z,
            movement.yaw,
            TILT_LIMIT,
            movement
        );
        const autonomousRight = autonomousCommands.right ?? 0;
        const autonomousPitchInput = THREE.MathUtils.clamp(
            -((autonomousCommands.pitch ?? 0) / Math.max(0.0001, TILT_LIMIT)),
            -1,
            1
        );
        const autonomousForward =
            (autonomousCommands.forward ?? autonomousPitchInput) * MOVE_SPEED * PITCH_ROLL_MOVE_GAIN;

        rightCommand = THREE.MathUtils.lerp(rightCommand, autonomousRight, autonomyWeight);
        forwardCommand = THREE.MathUtils.lerp(forwardCommand, autonomousForward, autonomyWeight);
        targetMovement.roll = THREE.MathUtils.lerp(targetMovement.roll, autonomousCommands.roll, autonomyWeight);
        targetMovement.pitch = THREE.MathUtils.lerp(targetMovement.pitch, autonomousCommands.pitch, autonomyWeight);
        targetMovement.yawRate = THREE.MathUtils.lerp(targetMovement.yawRate, autonomousCommands.yaw, autonomyWeight);
        targetMovement.y = THREE.MathUtils.lerp(targetMovement.y, autonomousCommands.throttle, autonomyWeight);
    }

    const commandYaw = movement.yaw + targetMovement.yawRate * FIXED_TIME_STEP;
    const cosYaw = Math.cos(commandYaw);
    const sinYaw = Math.sin(commandYaw);
    targetMovement.x = (rightCommand * cosYaw - forwardCommand * sinYaw) * safetyScale;
    targetMovement.z = (-rightCommand * sinYaw - forwardCommand * cosYaw) * safetyScale;

    if (assistedMode && pilotPlanarNeutral && inCenterRegion && !autonomyActive) {
        targetMovement.x = 0;
        targetMovement.z = 0;
    }

    if (assistedMode) {
        const rescueBlend = THREE.MathUtils.clamp((edgeRatio - EDGE_RESCUE_START) / (1 - EDGE_RESCUE_START), 0, 1);
        const dynamicTiltLimit = THREE.MathUtils.lerp(TILT_LIMIT, EDGE_RESCUE_MAX_TILT, rescueBlend);
        targetMovement.roll = THREE.MathUtils.clamp(targetMovement.roll, -dynamicTiltLimit, dynamicTiltLimit);
        targetMovement.pitch = THREE.MathUtils.clamp(targetMovement.pitch, -dynamicTiltLimit, dynamicTiltLimit);
    }

    targetMovement.x += windImpulse.x;
    targetMovement.y += windImpulse.y;
    targetMovement.z += windImpulse.z;
    targetMovement.roll += windImpulse.roll;
    targetMovement.pitch += windImpulse.pitch;
    targetMovement.yawRate += windImpulse.yaw;

    if (windImpulse.x || windImpulse.y || windImpulse.z || windImpulse.roll || windImpulse.pitch || windImpulse.yaw) {
        targetMovement.x += windImpulse.x * 0.8;
        targetMovement.z += windImpulse.z * 0.8;
        targetMovement.y += windImpulse.y * 0.45;
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

    if (assistedMode && pilotPlanarNeutral && !autonomyActive) {
        movement.x = THREE.MathUtils.lerp(movement.x, 0, ASSIST_STOP_DAMPING);
        movement.z = THREE.MathUtils.lerp(movement.z, 0, ASSIST_STOP_DAMPING);
        if (!assistPulseCycle.rollOn) {
            movement.roll = THREE.MathUtils.lerp(movement.roll, 0, 0.45);
        }
        if (!assistPulseCycle.pitchOn) {
            movement.pitch = THREE.MathUtils.lerp(movement.pitch, 0, 0.45);
        }
    }

    if (assistedMode && centerHoldActive && !autonomyActive) {
        movement.x = THREE.MathUtils.lerp(movement.x, 0, CENTER_HOLD_DAMPING);
        movement.z = THREE.MathUtils.lerp(movement.z, 0, CENTER_HOLD_DAMPING);
        movement.roll = THREE.MathUtils.lerp(movement.roll, 0, CENTER_HOLD_DAMPING);
        movement.pitch = THREE.MathUtils.lerp(movement.pitch, 0, CENTER_HOLD_DAMPING);
        targetMovement.roll = 0;
        targetMovement.pitch = 0;
    }

    if (assistedMode && pilotPlanarNeutral && inCenterRegion && !autonomyActive) {
        movement.x = THREE.MathUtils.lerp(movement.x, 0, CENTER_HOLD_TRANSLATION_DAMPING);
        movement.z = THREE.MathUtils.lerp(movement.z, 0, CENTER_HOLD_TRANSLATION_DAMPING);
        if (Math.abs(movement.x) < CENTER_HOLD_TRANSLATION_SNAP) {
            movement.x = 0;
        }
        if (Math.abs(movement.z) < CENTER_HOLD_TRANSLATION_SNAP) {
            movement.z = 0;
        }
    }

    if (shouldAutoLevel && !autonomyActive) {
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
        prevGamepadLBPressed = false;
        prevGamepadRBPressed = false;
        return;
    }

    const yPressed = Boolean(gamepad.buttons?.[3]?.pressed);
    const xPressed = Boolean(gamepad.buttons?.[2]?.pressed);
    const lbPressed = Boolean(gamepad.buttons?.[4]?.pressed);
    const rbPressed = Boolean(gamepad.buttons?.[5]?.pressed);

    if (yPressed && !prevGamepadYPressed) {
        assistedMode = !assistedMode;
    }

    if (xPressed && !prevGamepadXPressed) {
        toggleEnvironmentMode();
    }

    if (lbPressed && !prevGamepadLBPressed) {
        autonomy.setEnabled(!autonomy.enabled);
    }

    if (rbPressed && !prevGamepadRBPressed) {
        openDestinationModal();
    }

    prevGamepadYPressed = yPressed;
    prevGamepadXPressed = xPressed;
    prevGamepadLBPressed = lbPressed;
    prevGamepadRBPressed = rbPressed;
}

function updateTrayBody() {
    if (droneCrashed) {
        return;
    }

    const desiredY = Math.max(
        trayBody.position.y + movement.y * FIXED_TIME_STEP,
        MIN_ALTITUDE + TRAY_OFFSET_Y
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
            triggerDroneCrash(
                trayBody.velocity.x,
                trayBody.velocity.y,
                trayBody.velocity.z
            );
            break;
        }
    }

    if (droneCrashed) {
        return;
    }

    trayPos.set(targetX, targetY, targetZ);

    const velocityX = (targetX - trayBody.position.x) / FIXED_TIME_STEP;
    const velocityZ = (targetZ - trayBody.position.z) / FIXED_TIME_STEP;
    trayBody.velocity.set(velocityX, clampedYDelta / FIXED_TIME_STEP, velocityZ);
    trayBody.angularVelocity.set(0, 0, 0);

    if (windImpulse.x || windImpulse.y || windImpulse.z || windImpulse.roll || windImpulse.pitch || windImpulse.yaw) {
        trayBody.velocity.x += windImpulse.x * 9.5;
        trayBody.velocity.y += windImpulse.y * 6.0;
        trayBody.velocity.z += windImpulse.z * 9.5;
        trayBody.angularVelocity.x += windImpulse.pitch * 5.0;
        trayBody.angularVelocity.y += windImpulse.yaw * 5.5;
        trayBody.angularVelocity.z += windImpulse.roll * 5.0;
    }
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

    if (trayBallMarker) {
        trayBallMarker.position.x = THREE.MathUtils.clamp(ballLocalPosition.x, -traySafeHalf, traySafeHalf);
        trayBallMarker.position.z = THREE.MathUtils.clamp(ballLocalPosition.z, -traySafeHalf, traySafeHalf);
        trayBallMarker.visible = isBallInsideTray();
    }

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

    renderFrontCameraView(insetX, insetY, insetWidth, insetHeight, true);
}

function renderCameraView(activeCamera, viewportX, viewportY, viewportWidth, viewportHeight, useScissor = false) {
    activeCamera.aspect = viewportWidth / viewportHeight;
    activeCamera.updateProjectionMatrix();

    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setScissorTest(useScissor);
    renderer.setViewport(viewportX, viewportY, viewportWidth, viewportHeight);

    if (useScissor) {
        renderer.setScissor(viewportX, viewportY, viewportWidth, viewportHeight);
    }

    renderer.clearDepth();
    renderer.render(scene, activeCamera);

    if (useScissor) {
        renderer.setScissorTest(false);
    }

    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.autoClear = previousAutoClear;
}

function renderFrontCameraView(viewportX, viewportY, viewportWidth, viewportHeight, useScissor = false) {
    renderCameraView(droneFrontCamera, viewportX, viewportY, viewportWidth, viewportHeight, useScissor);
}

function renderStereoMobileView() {
    const dividerWidth = FPV_DIVIDER_WIDTH;
    const availableWidth = Math.max(0, window.innerWidth - dividerWidth);
    const leftWidth = Math.floor(availableWidth / 2);
    const rightWidth = availableWidth - leftWidth;

    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.clear();

    renderCameraView(droneFrontCameraLeft, 0, 0, leftWidth, window.innerHeight, true);
    renderCameraView(droneFrontCameraRight, leftWidth + dividerWidth, 0, rightWidth, window.innerHeight, true);

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.autoClear = previousAutoClear;
}

/**
 * Autonomous Destination Modal Handler
 */
function openDestinationModal() {
    if (destinationModal) {
        destinationModal.classList.remove('hidden');
        destinationModal.setAttribute('aria-hidden', 'false');
        if (destinationXInput) {
            destinationXInput.value = autonomy.hasDestination ? autonomy.destinationX.toFixed(1) : trayBody.position.x.toFixed(1);
            destinationXInput.focus();
            destinationXInput.select();
        }
        if (destinationZInput) {
            destinationZInput.value = autonomy.hasDestination ? autonomy.destinationZ.toFixed(1) : trayBody.position.z.toFixed(1);
        }
    }
}

function closeDestinationModal() {
    if (destinationModal) {
        destinationModal.classList.add('hidden');
        destinationModal.setAttribute('aria-hidden', 'true');
    }
}

function setDestinationFromModal() {
    if (!destinationXInput || !destinationZInput) {
        alert('Destination inputs are not available.');
        return;
    }

    const destX = parseFloat(destinationXInput.value);
    const destZ = parseFloat(destinationZInput.value);

    if (Number.isNaN(destX) || Number.isNaN(destZ)) {
        alert('Please enter valid coordinates');
        return;
    }

    if (setAutonomousDestination(destX, destZ)) {
        closeDestinationModal();
    }
}

function generateRandomDestination() {
    ensureNavigationGrid();

    const attempts = 50;
    for (let i = 0; i < attempts; i++) {
        const destX = Math.random() * 200 - 100;
        const destZ = Math.random() * 200 - 100;

        if (navigationGrid.isPointWalkable(destX, destZ)) {
            if (destinationXInput) {
                destinationXInput.value = destX.toFixed(1);
            }
            if (destinationZInput) {
                destinationZInput.value = destZ.toFixed(1);
            }
            return;
        }
    }

    if (destinationXInput) {
        destinationXInput.value = '0';
    }
    if (destinationZInput) {
        destinationZInput.value = '0';
    }
}

function setDestinationToCenter() {
    if (destinationXInput) {
        destinationXInput.value = '0';
    }
    if (destinationZInput) {
        destinationZInput.value = '0';
    }
}

function handleMiniMapDestinationPick(event) {
    if (!miniMapCanvas || !miniMapContext || isMobileFrontView) {
        return;
    }

    const rect = miniMapCanvas.getBoundingClientRect();
    const canvasX = ((event.clientX - rect.left) / rect.width) * miniMapCanvas.width;
    const canvasY = ((event.clientY - rect.top) / rect.height) * miniMapCanvas.height;
    const centerX = miniMapCanvas.width * 0.5;
    const centerY = miniMapCanvas.height * 0.5;
    const radius = Math.min(miniMapCanvas.width, miniMapCanvas.height) * 0.48;
    const deltaX = canvasX - centerX;
    const deltaY = canvasY - centerY;

    if (Math.hypot(deltaX, deltaY) > radius) {
        return;
    }

    const pixelsPerMeter = radius / MINIMAP_RANGE;
    const targetX = trayBody.position.x + deltaX / pixelsPerMeter;
    const targetZ = trayBody.position.z + deltaY / pixelsPerMeter;
    setAutonomousDestination(targetX, targetZ);
}

/**
 * Initialize Autonomous System UI Event Listeners
 */
function initializeAutonomousUI() {
    const setDestBtn = document.getElementById('set-destination');
    const cancelBtn = document.getElementById('cancel-modal');
    const randomBtn = document.getElementById('random-dest');
    const centerBtn = document.getElementById('center-world');

    if (setDestBtn) {
        setDestBtn.addEventListener('click', setDestinationFromModal);
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeDestinationModal);
    }
    if (randomBtn) {
        randomBtn.addEventListener('click', generateRandomDestination);
    }
    if (centerBtn) {
        centerBtn.addEventListener('click', setDestinationToCenter);
    }
    if (openDestinationButton) {
        openDestinationButton.addEventListener('click', () => {
            setWorldPickMode(false);
            openDestinationModal();
        });
    }
    if (toggleWorldPickButton) {
        toggleWorldPickButton.addEventListener('click', () => {
            if (destinationModal && !destinationModal.classList.contains('hidden')) {
                closeDestinationModal();
            }
            setWorldPickMode(!worldPickMode);
        });
    }
    if (clearDestinationButton) {
        clearDestinationButton.addEventListener('click', clearAutonomousRoute);
    }
    if (miniMapCanvas) {
        miniMapCanvas.addEventListener('click', handleMiniMapDestinationPick);
    }
    if (destinationXInput && destinationZInput) {
        const submitOnEnter = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                setDestinationFromModal();
            }
        };
        destinationXInput.addEventListener('keydown', submitOnEnter);
        destinationZInput.addEventListener('keydown', submitOnEnter);
    }

    if (destinationModal) {
        destinationModal.addEventListener('click', (event) => {
            if (event.target === destinationModal) {
                closeDestinationModal();
            }
        });
    }

    updateWorldPickUi();
}

function animate() {
    requestAnimationFrame(animate);

    if (isMobileFrontView) {
        if (mirrorStateSnapshot) {
            applyMirrorState(mirrorStateSnapshot);
        }

        updateBallLocalState();
        syncVisuals();
        drawMiniMap();
        updateTelemetry();
        if (mobileStereoFpvEnabled) {
            renderStereoMobileView();
        } else {
            renderFrontCameraView(0, 0, window.innerWidth, window.innerHeight, false);
        }
        return;
    }

    updateInput();
    handleGamepadToggles();
    updateBallLocalState();
    updateWindImpulse();
    updateWindIndicator();

    if (autonomy.enabled && autonomy.hasDestination && autonomy.isPlanning && navigationGrid) {
        autonomy.planPath(trayBody.position.x, trayBody.position.z, navigationGrid);
    }

    updateMovementState();
    updateTrayBody();

    world.step(FIXED_TIME_STEP);

    updateBallLocalState();
    applyEdgeBounceAssist();
    applyCenterLockAssist();
    updateBallLocalState();

    if (droneCrashed) {
        setOverlayVisible(true);
    }

    if (!droneCrashed && isBallInsideTray()) {
        outOfTrayTime = 0;
        setOverlayVisible(false);
    } else {
        outOfTrayTime += FIXED_TIME_STEP;
        if (!droneCrashed) {
            setOverlayVisible(outOfTrayTime >= OUT_OF_TRAY_GRACE_TIME);
        }
        if (!droneCrashed && autonomy.enabled && outOfTrayTime >= OUT_OF_TRAY_GRACE_TIME) {
            autonomy.setEnabled(false);
            clearPathVisualization();
        }
    }

    syncVisuals();
    updatePathVisualization();
    updateCamera();
    drawMiniMap();
    updateTelemetry();
    publishMirrorState();

    renderer.render(scene, camera);
    renderMiniCameraView();
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    if (isMobileFrontView) {
        droneFrontCamera.aspect = window.innerWidth / window.innerHeight;
        droneFrontCamera.updateProjectionMatrix();
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (!isMobileFrontView) {
        renderMiniCameraView();
    }
});

