import * as THREE from 'three';

export function createDrone() {
    const drone = new THREE.Group();
    drone.name = 'drone';

    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2f2f35 });
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4a52 });
    const motorMaterial = new THREE.MeshStandardMaterial({ color: 0x1f1f25 });
    const rotorMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff99 });
    const trayMaterial = new THREE.MeshStandardMaterial({ color: 0x5e6470 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.22, 0.6), bodyMaterial);
    drone.add(body);

    const trayGroup = new THREE.Group();
    trayGroup.position.y = 0.22;
    drone.add(trayGroup);

    const trayBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 1.2), trayMaterial);
    trayGroup.add(trayBase);

    const wallThickness = 0.06;
    const wallHeight = 0.16;
    const halfTray = 0.6;

    const northWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, wallHeight, wallThickness), trayMaterial);
    northWall.position.set(0, wallHeight * 0.5, halfTray - wallThickness * 0.5);
    trayGroup.add(northWall);

    const southWall = northWall.clone();
    southWall.position.z = -northWall.position.z;
    trayGroup.add(southWall);

    const eastWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, 1.2), trayMaterial);
    eastWall.position.set(halfTray - wallThickness * 0.5, wallHeight * 0.5, 0);
    trayGroup.add(eastWall);

    const westWall = eastWall.clone();
    westWall.position.x = -eastWall.position.x;
    trayGroup.add(westWall);

    const ringDistance = 0.82;
    const armRadius = 0.03;
    const ringPoints = [
        new THREE.Vector3(ringDistance, 0, ringDistance),
        new THREE.Vector3(-ringDistance, 0, ringDistance),
        new THREE.Vector3(-ringDistance, 0, -ringDistance),
        new THREE.Vector3(ringDistance, 0, -ringDistance),
    ];

    const upAxis = new THREE.Vector3(0, 1, 0);

    ringPoints.forEach((point) => {
        const direction = point.clone().normalize();
        const armLength = point.length();

        const arm = new THREE.Mesh(
            new THREE.CylinderGeometry(armRadius, armRadius, armLength, 10),
            armMaterial
        );
        arm.position.copy(point.clone().multiplyScalar(0.5));
        arm.quaternion.setFromUnitVectors(upAxis, direction);
        drone.add(arm);

        const motor = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.07, 0.12, 16),
            motorMaterial
        );
        motor.position.copy(point);
        motor.position.y = 0.06;
        drone.add(motor);

        const rotor = new THREE.Mesh(
            new THREE.TorusGeometry(0.18, 0.02, 12, 32),
            rotorMaterial
        );
        rotor.rotation.x = Math.PI * 0.5;
        rotor.position.copy(point);
        rotor.position.y = 0.13;
        drone.add(rotor);
    });

    return drone;
}
