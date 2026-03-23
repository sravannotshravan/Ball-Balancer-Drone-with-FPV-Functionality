function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
    let wrapped = angle;
    while (wrapped > Math.PI) {
        wrapped -= Math.PI * 2;
    }
    while (wrapped < -Math.PI) {
        wrapped += Math.PI * 2;
    }
    return wrapped;
}

export class AutonomySystem {
    constructor() {
        this.enabled = false;
        this.hasDestination = false;
        this.destinationX = 0;
        this.destinationZ = 0;
        this.currentWaypointIndex = 0;
        this.waypointPath = [];
        this.isPlanning = false;
        this.pilotOverride = false;
        this.overrideBlendFactor = 0;
        this.arrived = false;
        this.lastPlanStart = null;
        this.lastPlanError = '';
    }

    clearRoute(keepDestination = false) {
        if (!keepDestination) {
            this.hasDestination = false;
            this.destinationX = 0;
            this.destinationZ = 0;
        }
        this.currentWaypointIndex = 0;
        this.waypointPath = [];
        this.isPlanning = false;
        this.arrived = false;
        this.lastPlanStart = null;
        this.lastPlanError = '';
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        if (!this.enabled) {
            this.clearRoute(true);
            this.pilotOverride = false;
            this.overrideBlendFactor = 0;
        }
    }

    setDestination(destX, destZ, navigationGrid) {
        if (!Number.isFinite(destX) || !Number.isFinite(destZ)) {
            return 'Destination coordinates are invalid.';
        }

        if (navigationGrid && !navigationGrid.isPointWalkable(destX, destZ)) {
            return 'Destination is blocked or outside the map.';
        }

        this.destinationX = destX;
        this.destinationZ = destZ;
        this.hasDestination = true;
        this.currentWaypointIndex = 0;
        this.waypointPath = [];
        this.isPlanning = true;
        this.arrived = false;
        this.lastPlanError = '';
        return null;
    }

    planPath(startX, startZ, navigationGrid) {
        if (!this.hasDestination || !navigationGrid) {
            this.isPlanning = false;
            return [];
        }

        this.isPlanning = false;
        this.lastPlanStart = { x: startX, z: startZ };

        const rawPath = navigationGrid.findPath(startX, startZ, this.destinationX, this.destinationZ);
        if (!rawPath.length) {
            this.waypointPath = [];
            this.currentWaypointIndex = 0;
            this.lastPlanError = 'No clear path found.';
            return [];
        }

        const trimmed = rawPath.slice(1);
        this.waypointPath = trimmed;
        this.currentWaypointIndex = 0;
        this.lastPlanError = '';
        return this.waypointPath;
    }

    calculateMovementCommands(currentX, currentZ, currentYaw, tiltLimit, movement = {}) {
        if (!this.enabled || !this.hasDestination || this.waypointPath.length === 0) {
            return { roll: 0, pitch: 0, yaw: 0, throttle: 0, x: 0, z: 0, forward: 0, right: 0 };
        }

        const arrivalRadius = 1.2;
        const waypointRadius = 1.75;
        const slowRadius = 8;
        const turnAnticipationRadius = 4.5;

        let target = this.waypointPath[this.currentWaypointIndex] ?? null;
        while (target) {
            const distance = Math.hypot(target.x - currentX, target.z - currentZ);
            const isLast = this.currentWaypointIndex >= this.waypointPath.length - 1;
            const radius = isLast ? arrivalRadius : waypointRadius;
            if (distance > radius) {
                break;
            }

            if (isLast) {
                this.arrived = true;
                this.waypointPath = [];
                this.currentWaypointIndex = 0;
                return { roll: 0, pitch: 0, yaw: 0, throttle: 0, x: 0, z: 0, forward: 0, right: 0 };
            }

            this.currentWaypointIndex += 1;
            target = this.waypointPath[this.currentWaypointIndex] ?? null;
        }

        if (!target) {
            return { roll: 0, pitch: 0, yaw: 0, throttle: 0, x: 0, z: 0, forward: 0, right: 0 };
        }

        const dx = target.x - currentX;
        const dz = target.z - currentZ;
        const distance = Math.hypot(dx, dz);
        if (distance < 1e-5) {
            return { roll: 0, pitch: 0, yaw: 0, throttle: 0, x: 0, z: 0, forward: 0, right: 0 };
        }

        const desiredYaw = Math.atan2(-dx, -dz);
        const yawError = normalizeAngle(desiredYaw - currentYaw);

        const yawAlignment = clamp(1 - Math.abs(yawError) / (Math.PI * 0.65), 0, 1);
        let speed = clamp(distance / slowRadius, 0.2, 1) * 0.9 * clamp(yawAlignment, 0.12, 1);

        const nextWaypoint = this.waypointPath[this.currentWaypointIndex + 1] ?? null;
        if (nextWaypoint && distance < turnAnticipationRadius) {
            const nextDx = nextWaypoint.x - target.x;
            const nextDz = nextWaypoint.z - target.z;
            const currentAngle = Math.atan2(dz, dx);
            const nextAngle = Math.atan2(nextDz, nextDx);
            const cornerAngle = Math.abs(normalizeAngle(nextAngle - currentAngle));
            const cornerSlowdown = clamp(1 - cornerAngle / Math.PI, 0.45, 1);
            speed *= cornerSlowdown;
        }

        const movementMagnitude = Math.hypot(movement.x ?? 0, movement.z ?? 0);
        if (movementMagnitude > 0.55) {
            speed *= 0.82;
        }

        const yawRate = clamp(yawError * 1.2, -0.8, 0.8);
        const maxAutoPitch = tiltLimit * 0.72;
        const pitchMagnitude = clamp(speed * maxAutoPitch, 0, maxAutoPitch);
        const shouldDriveForward = Math.abs(yawError) < 1.35;
        const pitchCommand = shouldDriveForward ? -pitchMagnitude : 0;

        return {
            x: 0,
            z: 0,
            right: 0,
            forward: shouldDriveForward ? clamp(speed, 0, 1) : 0,
            roll: 0,
            pitch: pitchCommand,
            yaw: yawRate,
            throttle: 0,
        };
    }

    updatePilotOverride(inputState = {}) {
        const overrideSignal = Math.max(
            Math.abs(inputState.roll ?? 0),
            Math.abs(inputState.pitch ?? 0),
            Math.abs(inputState.moveX ?? 0),
            Math.abs(inputState.moveZ ?? 0),
            Math.abs(inputState.yaw ?? 0),
            Math.abs(inputState.throttle ?? 0)
        );

        this.pilotOverride = overrideSignal > 0.08;
        const targetBlend = this.pilotOverride ? 0.92 : 0;
        this.overrideBlendFactor += (targetBlend - this.overrideBlendFactor) * (this.pilotOverride ? 0.18 : 0.08);
        this.overrideBlendFactor = clamp(this.overrideBlendFactor, 0, 1);
    }

    getWaypointPath() {
        return this.waypointPath.slice(this.currentWaypointIndex);
    }

    getDestination() {
        return this.hasDestination ? { x: this.destinationX, z: this.destinationZ } : null;
    }

    isDestinationReached() {
        return this.arrived;
    }

    reset() {
        this.enabled = false;
        this.clearRoute(false);
        this.pilotOverride = false;
        this.overrideBlendFactor = 0;
    }
}
