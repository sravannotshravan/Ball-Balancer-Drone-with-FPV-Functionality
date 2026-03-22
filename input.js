export const input = {
    moveX: 0,
    moveZ: 0,
    tiltX: 0,
    tiltZ: 0,
};

const keyState = {
    KeyW: false,
    KeyS: false,
    KeyA: false,
    KeyD: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
};

const deadzone = 0.2;

function applyDeadzone(value) {
    if (Math.abs(value) < deadzone) {
        return 0;
    }
    return value;
}

function clampInput(value) {
    return Math.max(-1, Math.min(1, value));
}

function getKeyboardAxes() {
    const moveX = (keyState.KeyD ? 1 : 0) - (keyState.KeyA ? 1 : 0);
    const moveZ = (keyState.KeyS ? 1 : 0) - (keyState.KeyW ? 1 : 0);
    const tiltX = (keyState.ArrowRight ? 1 : 0) - (keyState.ArrowLeft ? 1 : 0);
    const tiltZ = (keyState.ArrowDown ? 1 : 0) - (keyState.ArrowUp ? 1 : 0);

    return { moveX, moveZ, tiltX, tiltZ };
}

function getGamepadAxes() {
    const gamepad = navigator.getGamepads?.()[0];

    if (!gamepad) {
        return { moveX: 0, moveZ: 0, tiltX: 0, tiltZ: 0 };
    }

    return {
        moveX: applyDeadzone(gamepad.axes[0] ?? 0),
        moveZ: applyDeadzone(gamepad.axes[1] ?? 0),
        tiltX: applyDeadzone(gamepad.axes[2] ?? 0),
        tiltZ: applyDeadzone(gamepad.axes[3] ?? 0),
    };
}

function recomputeUnifiedInput() {
    const keyboard = getKeyboardAxes();
    const gamepad = getGamepadAxes();

    input.moveX = clampInput(keyboard.moveX + gamepad.moveX);
    input.moveZ = clampInput(keyboard.moveZ + gamepad.moveZ);
    input.tiltX = clampInput(keyboard.tiltX + gamepad.tiltX);
    input.tiltZ = clampInput(keyboard.tiltZ + gamepad.tiltZ);
}

window.addEventListener('keydown', (event) => {
    if (event.code in keyState) {
        keyState[event.code] = true;
    }
});

window.addEventListener('keyup', (event) => {
    if (event.code in keyState) {
        keyState[event.code] = false;
    }
});

export function updateInput() {
    recomputeUnifiedInput();
}
