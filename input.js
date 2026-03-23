export const input = {
    moveX: 0,
    moveZ: 0,
    roll: 0,
    pitch: 0,
    yaw: 0,
    throttle: 0,
};

export let activeInputSource = 'keyboard';

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

const controlKeys = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

function applyDeadzone(value) {
    if (Math.abs(value) < deadzone) {
        return 0;
    }
    return value;
}

function clampInput(value) {
    return Math.max(-1, Math.min(1, value));
}

function handleKeyboardEvent(event, pressed) {
    if (event.code in keyState) {
        keyState[event.code] = pressed;
        activeInputSource = 'keyboard';
    }

    if (controlKeys.has(event.code)) {
        event.preventDefault();
    }
}

function getKeyboardAxes() {
    const moveX = (keyState.KeyD ? 1 : 0) - (keyState.KeyA ? 1 : 0);
    const moveZ = (keyState.KeyS ? 1 : 0) - (keyState.KeyW ? 1 : 0);
    const roll = (keyState.ArrowLeft ? 1 : 0) - (keyState.ArrowRight ? 1 : 0);
    const pitch = (keyState.ArrowUp ? 1 : 0) - (keyState.ArrowDown ? 1 : 0);

    return { moveX, moveZ, roll, pitch };
}

function getGamepadAxes() {
    const gamepad = navigator.getGamepads?.()[0];

    if (!gamepad) {
        return { yaw: 0, throttle: 0, roll: 0, pitch: 0 };
    }

    return {
        yaw: -applyDeadzone(gamepad.axes[0] ?? 0),
        throttle: applyDeadzone(-(gamepad.axes[1] ?? 0)),
        roll: -applyDeadzone(gamepad.axes[2] ?? 0),
        pitch: applyDeadzone(-(gamepad.axes[3] ?? 0)),
    };
}

function recomputeUnifiedInput() {
    const keyboard = getKeyboardAxes();
    const gamepad = getGamepadAxes();

    const keyboardActive =
        keyboard.moveX !== 0 ||
        keyboard.moveZ !== 0 ||
        keyboard.roll !== 0 ||
        keyboard.pitch !== 0;

    const gamepadActive =
        Math.abs(gamepad.yaw) > 0 ||
        Math.abs(gamepad.throttle) > 0 ||
        Math.abs(gamepad.roll) > 0 ||
        Math.abs(gamepad.pitch) > 0;

    if (gamepadActive) {
        activeInputSource = 'gamepad';
    } else if (keyboardActive) {
        activeInputSource = 'keyboard';
    }

    input.moveX = clampInput(keyboard.moveX);
    input.moveZ = clampInput(keyboard.moveZ);
    input.roll = clampInput(keyboard.roll + gamepad.roll);
    input.pitch = clampInput(keyboard.pitch + gamepad.pitch);
    input.yaw = clampInput(gamepad.yaw);
    input.throttle = clampInput(gamepad.throttle);
}

document.addEventListener('keydown', (event) => {
    handleKeyboardEvent(event, true);
}, { passive: false });

document.addEventListener('keyup', (event) => {
    handleKeyboardEvent(event, false);
}, { passive: false });

window.addEventListener('blur', () => {
    Object.keys(keyState).forEach((code) => {
        keyState[code] = false;
    });
});

export function updateInput() {
    recomputeUnifiedInput();
}
