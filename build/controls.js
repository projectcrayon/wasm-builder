import {
  DEFAULT_GAMEPAD_BUTTON_BINDINGS,
  NO_GAMEPAD_STATUS,
} from "./input-manager.js";

const VOLUME_STORAGE_KEY = "arcana-volume";
const BINDINGS_STORAGE_KEY = "arcana-gamepad-bindings";
const DEFAULT_VOLUME = 0.5;
const DEFAULT_STATUS = NO_GAMEPAD_STATUS;

function loadVolume() {
  const stored = Number(localStorage.getItem(VOLUME_STORAGE_KEY));
  if (Number.isFinite(stored)) {
    return Math.min(Math.max(stored, 0), 1);
  }
  return DEFAULT_VOLUME;
}

function loadBindings() {
  try {
    const raw = localStorage.getItem(BINDINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GAMEPAD_BUTTON_BINDINGS };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        ...DEFAULT_GAMEPAD_BUTTON_BINDINGS,
        ...Object.fromEntries(
          Object.entries(parsed).map(([key, value]) => [key, Number(value)])
        ),
      };
    }
  } catch (err) {
    console.warn("Failed to restore saved gamepad bindings", err);
  }
  return { ...DEFAULT_GAMEPAD_BUTTON_BINDINGS };
}

export function initControls({ onVolumeChange, onBindingsChange }) {
  const volumeToggle = document.getElementById("volumeToggle");
  const volumePanel = document.getElementById("volumePanel");
  const volumeSlider = document.getElementById("volumeSlider");
  const gamepadToggle = document.getElementById("gamepadToggle");
  const gamepadPanel = document.getElementById("gamepadPanel");
  const gamepadStatus = document.getElementById("gamepadStatus");

  if (
    !volumeToggle ||
    !volumePanel ||
    !volumeSlider ||
    !gamepadToggle ||
    !gamepadPanel ||
    !gamepadStatus
  ) {
    throw new Error("Controls markup missing expected elements");
  }

  let currentVolume = loadVolume();
  let currentBindings = loadBindings();

  volumeSlider.value = String(Math.round(currentVolume * 100));
  gamepadStatus.textContent = DEFAULT_STATUS;

  const controlPanels = [
    { toggle: volumeToggle, panel: volumePanel, focus: () => volumeSlider },
    {
      toggle: gamepadToggle,
      panel: gamepadPanel,
      focus: () => gamepadPanel.querySelector("select"),
    },
  ];

  function closePanel(panel, toggle) {
    panel.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
  }

  function openPanel(panel, toggle, focusTargetFactory) {
    controlPanels.forEach(({ panel: otherPanel, toggle: otherToggle }) => {
      if (otherPanel !== panel) {
        closePanel(otherPanel, otherToggle);
      }
    });
    panel.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    if (typeof focusTargetFactory === "function") {
      setTimeout(() => {
        const focusTarget = focusTargetFactory();
        focusTarget?.focus?.({ preventScroll: true });
      }, 0);
    }
  }

  function togglePanel(panel, toggle, focusTargetFactory) {
    const isHidden = panel.getAttribute("aria-hidden") !== "false";
    if (isHidden) {
      openPanel(panel, toggle, focusTargetFactory);
    } else {
      closePanel(panel, toggle);
    }
  }

  function applyVolume(value) {
    currentVolume = Math.min(Math.max(value, 0), 1);
    localStorage.setItem(VOLUME_STORAGE_KEY, String(currentVolume));
    const icon =
      currentVolume === 0
        ? "🔇"
        : currentVolume < 0.4
        ? "🔈"
        : currentVolume < 0.75
        ? "🔉"
        : "🔊";
    volumeToggle.textContent = `${icon} Volume`;
    onVolumeChange?.(currentVolume);
  }

  volumeSlider.addEventListener("input", (event) => {
    applyVolume(Number(event.target.value) / 100);
  });

  volumeToggle.addEventListener("click", () => {
    togglePanel(volumePanel, volumeToggle, () => volumeSlider);
  });

  const GAMEPAD_BUTTON_OPTIONS = [
    { value: 0, label: "Bottom (Cross/A)" },
    { value: 1, label: "Right (Circle/B)" },
    { value: 2, label: "Left (Square/X)" },
    { value: 3, label: "Top (Triangle/Y)" },
    { value: 4, label: "L1" },
    { value: 5, label: "R1" },
    { value: 6, label: "L2" },
    { value: 7, label: "R2" },
    { value: 8, label: "Share / Select" },
    { value: 9, label: "Options / Start" },
    { value: 10, label: "L3" },
    { value: 11, label: "R3" },
    { value: 12, label: "D-pad Up" },
    { value: 13, label: "D-pad Down" },
    { value: 14, label: "D-pad Left" },
    { value: 15, label: "D-pad Right" },
  ];

  function persistBindings() {
    localStorage.setItem(
      BINDINGS_STORAGE_KEY,
      JSON.stringify({ ...currentBindings })
    );
    onBindingsChange?.({ ...currentBindings });
  }

  gamepadPanel
    .querySelectorAll("[data-gamepad-binding]")
    .forEach((select) => {
      const action = select.getAttribute("data-gamepad-binding");
      select.innerHTML = "";
      GAMEPAD_BUTTON_OPTIONS.forEach(({ value, label }) => {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = label;
        select.append(option);
      });
      const bindingValue = currentBindings[action] ??
        DEFAULT_GAMEPAD_BUTTON_BINDINGS[action];
      select.value = String(bindingValue);
      select.addEventListener("change", (event) => {
        currentBindings = {
          ...currentBindings,
          [action]: Number(event.target.value),
        };
        persistBindings();
      });
    });

  gamepadToggle.addEventListener("click", () => {
    togglePanel(gamepadPanel, gamepadToggle, () =>
      gamepadPanel.querySelector("select")
    );
  });

  document.addEventListener("click", (event) => {
    controlPanels.forEach(({ panel, toggle }) => {
      if (
        panel.getAttribute("aria-hidden") === "false" &&
        !panel.contains(event.target) &&
        !toggle.contains(event.target)
      ) {
        closePanel(panel, toggle);
      }
    });
  });

  applyVolume(currentVolume);
  onBindingsChange?.({ ...currentBindings });

  return {
    setGamepadStatus(text) {
      gamepadStatus.textContent = text || DEFAULT_STATUS;
    },
  };
}
