import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createDrone } from './drone.js';
import { input, updateInput } from './input.js';

const FIXED_TIME_STEP = 1 / 60;
const MOVE_SPEED = 3.2;
const TILT_LIMIT = 0.45;
const DRONE_HEIGHT = 2;
const TRAY_OFFSET_Y = 0.22;
const CAMERA_LERP = 0.08;
const MOVE_LERP = 0.1;
const TILT_LERP = 0.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb7d0e8);

const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0),
});

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 4, 8);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(8, 14, 10);
scene.add(directionalLight);

const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x6f8c63 })
);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.y = 0;
scene.add(groundMesh);

const groundPhysMaterial = new CANNON.Material('ground');
const trayPhysMaterial = new CANNON.Material('tray');
const ballPhysMaterial = new CANNON.Material('ball');

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

const trayHalfExtents = new CANNON.Vec3(0.6, 0.03, 0.6);
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
const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(ballRadius, 28, 20),
    new THREE.MeshStandardMaterial({ color: 0xff4e42 })
);
scene.add(ballMesh);

const ballBody = new CANNON.Body({
    mass: 0.35,
    material: ballPhysMaterial,
    shape: new CANNON.Sphere(ballRadius),
    position: new CANNON.Vec3(0, DRONE_HEIGHT + TRAY_OFFSET_Y + 0.25, 0),
    linearDamping: 0.2,
    angularDamping: 0.2,
});
world.addBody(ballBody);

world.addContactMaterial(
    new CANNON.ContactMaterial(groundPhysMaterial, ballPhysMaterial, {
        friction: 0.45,
        restitution: 0.2,
    })
);

world.addContactMaterial(
    new CANNON.ContactMaterial(trayPhysMaterial, ballPhysMaterial, {
        friction: 0.22,
        restitution: 0.05,
    })
);

const movement = {
    x: 0,
    z: 0,
    tiltX: 0,
    tiltZ: 0,
};

const targetMovement = {
    x: 0,
    z: 0,
    tiltX: 0,
    tiltZ: 0,
};

let autoBalance = false;

window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyB') {
        autoBalance = !autoBalance;
    }
});

const trayQuat = new CANNON.Quaternion();
const trayPos = new CANNON.Vec3();
const cameraOffset = new THREE.Vector3(0, 3.8, 7.5);
const cameraTargetPos = new THREE.Vector3();
const telemetry = {
    mode: document.getElementById('tm-mode'),
    altitude: document.getElementById('tm-altitude'),
    speed: document.getElementById('tm-speed'),
    pitch: document.getElementById('tm-pitch'),
    roll: document.getElementById('tm-roll'),
    yaw: document.getElementById('tm-yaw'),
};
const attitudeEuler = new THREE.Euler(0, 0, 0, 'YXZ');

function toDegrees(radians) {
    return radians * (180 / Math.PI);
}

function updateTelemetry() {
    if (!telemetry.mode) {
        return;
    }

    const speed = Math.hypot(trayBody.velocity.x, trayBody.velocity.y, trayBody.velocity.z);
    attitudeEuler.setFromQuaternion(drone.quaternion, 'YXZ');

    telemetry.mode.textContent = autoBalance ? 'AUTO' : 'MANUAL';
    telemetry.altitude.textContent = `${drone.position.y.toFixed(2)} m`;
    telemetry.speed.textContent = `${speed.toFixed(2)} m/s`;
    telemetry.pitch.textContent = `${toDegrees(attitudeEuler.x).toFixed(1)}°`;
    telemetry.roll.textContent = `${toDegrees(attitudeEuler.z).toFixed(1)}°`;
    telemetry.yaw.textContent = `${toDegrees(attitudeEuler.y).toFixed(1)}°`;
}

function updateMovementState() {
    targetMovement.x = input.moveX * MOVE_SPEED;
    targetMovement.z = input.moveZ * MOVE_SPEED;

    if (autoBalance) {
        const kP = 0.85;
        const errorX = ballBody.position.x - trayBody.position.x;
        const errorZ = ballBody.position.z - trayBody.position.z;
        targetMovement.tiltX = THREE.MathUtils.clamp(errorX * kP, -TILT_LIMIT, TILT_LIMIT);
        targetMovement.tiltZ = THREE.MathUtils.clamp(-errorZ * kP, -TILT_LIMIT, TILT_LIMIT);
    } else {
        targetMovement.tiltX = THREE.MathUtils.clamp(input.tiltX * TILT_LIMIT, -TILT_LIMIT, TILT_LIMIT);
        targetMovement.tiltZ = THREE.MathUtils.clamp(-input.tiltZ * TILT_LIMIT, -TILT_LIMIT, TILT_LIMIT);
    }

    movement.x = THREE.MathUtils.lerp(movement.x, targetMovement.x, MOVE_LERP);
    movement.z = THREE.MathUtils.lerp(movement.z, targetMovement.z, MOVE_LERP);
    movement.tiltX = THREE.MathUtils.lerp(movement.tiltX, targetMovement.tiltX, TILT_LERP);
    movement.tiltZ = THREE.MathUtils.lerp(movement.tiltZ, targetMovement.tiltZ, TILT_LERP);
}

function updateTrayBody() {
    trayPos.set(
        trayBody.position.x + movement.x * FIXED_TIME_STEP,
        DRONE_HEIGHT + TRAY_OFFSET_Y,
        trayBody.position.z + movement.z * FIXED_TIME_STEP
    );

    trayBody.velocity.set(movement.x, 0, movement.z);
    trayBody.angularVelocity.set(0, 0, 0);
    trayBody.position.copy(trayPos);

    trayQuat.setFromEuler(movement.tiltZ, 0, movement.tiltX, 'XYZ');
    trayBody.quaternion.copy(trayQuat);
}

function syncVisuals() {
    drone.position.set(trayBody.position.x, DRONE_HEIGHT, trayBody.position.z);
    drone.quaternion.set(
        trayBody.quaternion.x,
        trayBody.quaternion.y,
        trayBody.quaternion.z,
        trayBody.quaternion.w
    );

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

function animate() {
    requestAnimationFrame(animate);

    updateInput();
    updateMovementState();
    updateTrayBody();

    world.step(FIXED_TIME_STEP);

    syncVisuals();
    updateCamera();
    updateTelemetry();

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

