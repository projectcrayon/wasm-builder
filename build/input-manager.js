const KEYBOARD_MAPPING = {
  KeyZ: 0, // B
  KeyA: 1, // Y
  ShiftRight: 2, // Select
  Enter: 3, // Start
  ArrowUp: 4, // Up
  ArrowDown: 5, // Down
  ArrowLeft: 6, // Left
  ArrowRight: 7, // Right
  KeyX: 8, // A
  KeyS: 9, // X
  KeyQ: 10, // L
  KeyW: 11, // R
};

export const DEFAULT_GAMEPAD_BUTTON_BINDINGS = {
  primary: 0,
  secondary: 1,
  tertiary: 2,
  quaternary: 3,
  select: 8,
  start: 9,
  l1: 4,
  r1: 5,
};

const GAMEPAD_ACTION_TARGETS = {
  primary: 0,
  secondary: 8,
  tertiary: 9,
  quaternary: 1,
  select: 2,
  start: 3,
  l1: 10,
  r1: 11,
};

const GAMEPAD_DPAD_MAP = {
  12: 4,
  13: 5,
  14: 6,
  15: 7,
};

const GAMEPAD_AXIS_MAP = [
  { axis: 0, negative: 6, positive: 7 },
  { axis: 1, negative: 4, positive: 5 },
];

const AXIS_THRESHOLD = 0.35;
const MAX_INPUTS = 32;
export const NO_GAMEPAD_STATUS =
  "⌨️ Keyboard active. Connect a gamepad and press any button to switch.";

function normalizeBindings(source) {
  const bindings = { ...DEFAULT_GAMEPAD_BUTTON_BINDINGS };
  if (source && typeof source === "object") {
    for (const key of Object.keys(DEFAULT_GAMEPAD_BUTTON_BINDINGS)) {
      const maybe = Number(source[key]);
      if (Number.isFinite(maybe)) {
        bindings[key] = maybe;
      }
    }
  }
  return bindings;
}

export class InputManager {
  constructor({ moduleRef } = {}) {
    this.moduleRef = moduleRef || window.Module || {};
    this.keyboardState = new Array(MAX_INPUTS).fill(false);
    this.gamepadState = new Array(MAX_INPUTS).fill(false);
    this.gamepadBindings = normalizeBindings();
    this.gamepadButtonMap = {};
    this.trackedInputs = [];

    this.retro = null;
    this.sram = null;
    this.savestate = null;
    this.paused = false;

    this.gamepadIndex = null;
    this.gamepadFrameHandle = null;
    this.lastGamepadId = null;

    this.setGamepadStatusCallback(() => {});

    this.audioUnlockHandlersBound = false;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.onGamepadConnected = this.onGamepadConnected.bind(this);
    this.onGamepadDisconnected = this.onGamepadDisconnected.bind(this);
    this.gamepadLoop = this.gamepadLoop.bind(this);

    this.updateBindings(this.gamepadBindings);
    this.attachKeyboardListeners();

    window.addEventListener("gamepadconnected", this.onGamepadConnected);
    window.addEventListener("gamepaddisconnected", this.onGamepadDisconnected);
  }

  setModule(moduleRef) {
    this.moduleRef = moduleRef;
  }

  setGamepadStatusCallback(callback) {
    this.gamepadStatus = typeof callback === "function" ? callback : () => {};
    this.gamepadStatus(
      this.lastGamepadId ? `🎮 Gamepad connected: ${this.lastGamepadId}` : NO_GAMEPAD_STATUS
    );
  }

  attachKeyboardListeners() {
    if (!this.audioUnlockHandlersBound) {
      window.addEventListener("pointerdown", () => this.unlockAudioContext(), {
        once: true,
      });
      this.audioUnlockHandlersBound = true;
    }

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  handleKeyDown(e) {
    const { panel: volumePanel, toggle: volumeToggle } = this.getPanelRefs("volume");
    const { panel: gamepadPanel, toggle: gamepadToggle } = this.getPanelRefs(
      "gamepad"
    );

    if (
      volumePanel &&
      volumePanel.getAttribute("aria-hidden") === "false" &&
      (volumePanel.contains(e.target) || e.target === volumeToggle)
    ) {
      if (e.code === "Escape") {
        volumePanel.setAttribute("aria-hidden", "true");
        volumeToggle?.setAttribute("aria-expanded", "false");
        e.preventDefault();
      }
      return;
    }

    if (
      gamepadPanel &&
      gamepadPanel.getAttribute("aria-hidden") === "false" &&
      (gamepadPanel.contains(e.target) || e.target === gamepadToggle)
    ) {
      if (e.code === "Escape") {
        gamepadPanel.setAttribute("aria-hidden", "true");
        gamepadToggle?.setAttribute("aria-expanded", "false");
        e.preventDefault();
      }
      return;
    }

    e.preventDefault();
    this.unlockAudioContext();

    const mapped = KEYBOARD_MAPPING[e.code];
    if (mapped != null) {
      this.keyboardState[mapped] = true;
      this.updateInputIndices([mapped]);
    }

    if (e.code === "KeyF") {
      const wrapper = document.querySelector("#wrapper");
      wrapper?.webkitRequestFullScreen?.();
      wrapper?.mozRequestFullScreen?.();
      wrapper?.requestFullscreen?.();
    }
    if (e.code === "KeyR") {
      this.retro?.reset();
      if (this.sram && this.sram.length > 0) {
        this.retro.setSRAM(this.sram);
      }
    }
    if (e.code === "KeyY") {
      this.savestate = this.retro?.getState();
    }
    if (e.code === "KeyU") {
      if (this.savestate) {
        this.retro?.setState(this.savestate);
      }
    }
    if (e.code === "KeyG") {
      const canvas = document.querySelector("#screen");
      const dataURL = canvas?.toDataURL?.("image/png");
      if (dataURL) {
        console.log("Screenshot data URL:", dataURL);
        const img = document.createElement("img");
        img.src = dataURL;
        document.body.appendChild(img);
      }
    }
    if (e.code === "KeyH") {
      this.sram = this.retro?.getSRAM?.();
      console.log("SRAM length:", this.sram?.length ?? 0);
    }
    if (e.code === "KeyP") {
      this.paused = !this.paused;
      console.log("Paused:", this.paused);
      this.retro?.setPaused?.(this.paused);
    }
    if (e.code === "Escape") {
      const volumePanelOpen =
        volumePanel && volumePanel.getAttribute("aria-hidden") === "false";
      const gamepadPanelOpen =
        gamepadPanel && gamepadPanel.getAttribute("aria-hidden") === "false";
      if (volumePanelOpen || gamepadPanelOpen) {
        return;
      }
      this.keyboardState.fill(false);
      this.gamepadState.fill(false);
      this.updateAllInputs();
      this.retro?.unloadGame?.();
      this.detachRetro();
    }
  }

  handleKeyUp(e) {
    const { panel: volumePanel } = this.getPanelRefs("volume");
    const { panel: gamepadPanel } = this.getPanelRefs("gamepad");

    if (
      (volumePanel &&
        volumePanel.getAttribute("aria-hidden") === "false" &&
        volumePanel.contains(e.target)) ||
      (gamepadPanel &&
        gamepadPanel.getAttribute("aria-hidden") === "false" &&
        gamepadPanel.contains(e.target))
    ) {
      return;
    }

    if (KEYBOARD_MAPPING[e.code] == null) return;
    e.preventDefault();
    const idx = KEYBOARD_MAPPING[e.code];
    this.keyboardState[idx] = false;
    this.updateInputIndices([idx]);
  }

  getPanelRefs(name) {
    if (name === "volume") {
      return {
        panel: document.getElementById("volumePanel"),
        toggle: document.getElementById("volumeToggle"),
      };
    }
    if (name === "gamepad") {
      return {
        panel: document.getElementById("gamepadPanel"),
        toggle: document.getElementById("gamepadToggle"),
      };
    }
    return { panel: null, toggle: null };
  }

  unlockAudioContext() {
    const ctx = this.moduleRef?.audio?.ctx;
    if (!ctx) return;
    if (ctx.state !== "suspended") return;
    ctx.resume().catch((err) => {
      console.warn("Audio context resume blocked:", err);
    });
  }

  updateInputIndices(indices) {
    if (!this.retro?.input_user_state?.[0]) return;
    const state = this.retro.input_user_state[0];
    indices.forEach((index) => {
      if (index == null || index >= state.length) return;
      const kb = this.keyboardState[index] ?? false;
      const gp = this.gamepadState[index] ?? false;
      state[index] = kb || gp;
    });
  }

  updateAllInputs() {
    this.updateInputIndices(this.trackedInputs);
  }

  updateBindings(bindings) {
    this.gamepadBindings = normalizeBindings(bindings);
    this.gamepadButtonMap = {};
    for (const [action, buttonIndex] of Object.entries(this.gamepadBindings)) {
      const target = GAMEPAD_ACTION_TARGETS[action];
      if (target == null) continue;
      if (Number.isFinite(buttonIndex)) {
        this.gamepadButtonMap[buttonIndex] = target;
      }
    }
    this.trackedInputs = Array.from(
      new Set([
        ...Object.values(KEYBOARD_MAPPING),
        ...Object.values(this.gamepadButtonMap),
        ...Object.values(GAMEPAD_DPAD_MAP),
        ...GAMEPAD_AXIS_MAP.flatMap((mapping) => [
          mapping.negative,
          mapping.positive,
        ]),
      ])
    ).sort((a, b) => a - b);
    this.updateAllInputs();
  }

  attachRetro(retro) {
    this.retro = retro;
    this.paused = false;
    this.keyboardState.fill(false);
    this.gamepadState.fill(false);
    this.updateAllInputs();
    this.attachGamepad();
    this.gamepadStatus(
      this.lastGamepadId ? `🎮 Gamepad connected: ${this.lastGamepadId}` : NO_GAMEPAD_STATUS
    );
  }

  detachRetro() {
    this.retro = null;
    this.paused = false;
    this.cancelGamepadLoop();
    this.gamepadIndex = null;
    this.gamepadState.fill(false);
    this.updateAllInputs();
    this.gamepadStatus(NO_GAMEPAD_STATUS);
  }

  attachGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (pads) {
      for (const pad of pads) {
        if (pad) {
          this.gamepadIndex = pad.index;
          this.lastGamepadId = pad.id;
          break;
        }
      }
    }

    this.cancelGamepadLoop();
    if (this.gamepadIndex != null) {
      this.gamepadLoop();
      if (this.lastGamepadId) {
        this.gamepadStatus(`🎮 Gamepad connected: ${this.lastGamepadId}`);
      }
    } else {
      this.lastGamepadId = null;
      this.gamepadStatus(NO_GAMEPAD_STATUS);
    }
  }

  cancelGamepadLoop() {
    if (this.gamepadFrameHandle) {
      window.cancelAnimationFrame(this.gamepadFrameHandle);
      this.gamepadFrameHandle = null;
    }
  }

  pollGamepad() {
    if (this.gamepadIndex == null || !this.retro) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads?.[this.gamepadIndex];
    if (!pad) {
      this.gamepadIndex = null;
      this.gamepadState.fill(false);
      this.updateAllInputs();
      this.lastGamepadId = null;
      this.gamepadStatus(NO_GAMEPAD_STATUS);
      return;
    }

    if (pad.id !== this.lastGamepadId) {
      this.lastGamepadId = pad.id;
      this.gamepadStatus(`🎮 Gamepad connected: ${pad.id}`);
    }

    this.gamepadState.fill(false);

    pad.buttons.forEach((button, index) => {
      if (!button) return;
      const active = typeof button === "object" ? button.pressed : button === 1;
      if (!active) return;
      const target = this.gamepadButtonMap[index] ?? GAMEPAD_DPAD_MAP[index];
      if (target != null && target < this.gamepadState.length) {
        this.gamepadState[target] = true;
      }
    });

    for (const mapping of GAMEPAD_AXIS_MAP) {
      const value = pad.axes?.[mapping.axis] ?? 0;
      if (value <= -AXIS_THRESHOLD && mapping.negative < this.gamepadState.length) {
        this.gamepadState[mapping.negative] = true;
      } else if (
        value >= AXIS_THRESHOLD &&
        mapping.positive < this.gamepadState.length
      ) {
        this.gamepadState[mapping.positive] = true;
      }
    }

    this.updateAllInputs();
  }

  gamepadLoop() {
    this.pollGamepad();
    this.gamepadFrameHandle = window.requestAnimationFrame(this.gamepadLoop);
  }

  onGamepadConnected(event) {
    this.gamepadIndex = event.gamepad.index;
    this.lastGamepadId = event.gamepad.id;
    this.gamepadState.fill(false);
    if (this.retro && !this.gamepadFrameHandle) {
      this.gamepadLoop();
    }
    this.gamepadStatus(`🎮 Gamepad connected: ${event.gamepad.id}`);
  }

  onGamepadDisconnected(event) {
    if (event.gamepad.index !== this.gamepadIndex) return;
    this.gamepadIndex = null;
    this.lastGamepadId = null;
    this.cancelGamepadLoop();
    this.gamepadState.fill(false);
    this.updateAllInputs();
    this.gamepadStatus(NO_GAMEPAD_STATUS);
  }
}
