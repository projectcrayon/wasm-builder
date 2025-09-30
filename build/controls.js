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
    return normalizeBindingShape(parsed);
  }
} catch (err) {
  console.warn("Failed to restore saved gamepad bindings", err);
}
  return { ...DEFAULT_GAMEPAD_BUTTON_BINDINGS };
}

function normalizeBindingShape(source) {
  const result = { ...DEFAULT_GAMEPAD_BUTTON_BINDINGS };
  for (const [action, defaultValue] of Object.entries(
    DEFAULT_GAMEPAD_BUTTON_BINDINGS
  )) {
    const raw = Number(source?.[action]);
    if (Number.isFinite(raw)) {
      result[action] = raw;
    } else {
      result[action] = defaultValue;
    }
  }
  return result;
}

export function initControls({ onVolumeChange, onBindingsChange, onScreenshot }) {
  const controlsRoot = document.getElementById("controls");
  const controlsToggle = document.getElementById("controlsToggle");
  const controlsGroup = document.getElementById("controlsGroup");
  const volumeToggle = document.getElementById("volumeToggle");
  const volumePanel = document.getElementById("volumePanel");
  const volumeSlider = document.getElementById("volumeSlider");
  const gamepadToggle = document.getElementById("gamepadToggle");
  const gamepadPanel = document.getElementById("gamepadPanel");
  const gamepadStatus = document.getElementById("gamepadStatus");
  const screenshotButton = document.getElementById("screenshotBtn");

  if (
    !controlsRoot ||
    !controlsToggle ||
    !controlsGroup ||
    !volumeToggle ||
    !volumePanel ||
    !volumeSlider ||
    !gamepadToggle ||
    !gamepadPanel ||
    !gamepadStatus ||
    !screenshotButton
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

  function setControlsOpen(open) {
    controlsRoot.dataset.open = open ? "true" : "false";
    controlsToggle.setAttribute("aria-expanded", String(open));
    controlsGroup.setAttribute("aria-hidden", String(!open));
    if (!open) {
      controlPanels.forEach(({ panel, toggle }) => closePanel(panel, toggle));
    }
  }

  function ensureControlsOpen() {
    if (controlsRoot.dataset.open !== "true") {
      setControlsOpen(true);
    }
  }

  controlsToggle.addEventListener("click", () => {
    const isOpen = controlsRoot.dataset.open === "true";
    setControlsOpen(!isOpen);
    if (!isOpen) {
      controlsGroup.querySelector("button, input, select")?.focus?.({
        preventScroll: true,
      });
    }
  });

  controlsToggle.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setControlsOpen(false);
    }
  });

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
    ensureControlsOpen();
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
    currentBindings = normalizeBindingShape(currentBindings);
    localStorage.setItem(
      BINDINGS_STORAGE_KEY,
      JSON.stringify({ ...currentBindings })
    );
    onBindingsChange?.({ ...currentBindings });
  }

  const selectMap = new Map();

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
      selectMap.set(action, select);
      select.addEventListener("change", (event) => {
        const newValue = Number(event.target.value);
        if (!Number.isFinite(newValue)) return;
        const previousValue = currentBindings[action];
        if (previousValue === newValue) return;

        const existingEntry = Object.entries(currentBindings).find(
          ([otherAction, value]) => otherAction !== action && value === newValue
        );

        if (existingEntry) {
          const [otherAction] = existingEntry;
          const fallback = Number.isFinite(previousValue)
            ? previousValue
            : DEFAULT_GAMEPAD_BUTTON_BINDINGS[otherAction];
          currentBindings = {
            ...currentBindings,
            [otherAction]: fallback,
          };
          const otherSelect = selectMap.get(otherAction);
          if (otherSelect) {
            otherSelect.value = String(currentBindings[otherAction]);
          }
        }

        currentBindings = {
          ...currentBindings,
          [action]: newValue,
        };

        persistBindings();
      });
    });

  gamepadToggle.addEventListener("click", () => {
    ensureControlsOpen();
    togglePanel(gamepadPanel, gamepadToggle, () =>
      gamepadPanel.querySelector("select")
    );
  });

  screenshotButton.addEventListener("click", () => {
    screenshotButton.disabled = true;
    screenshotButton.textContent = "📸 Capturing...";
    Promise.resolve(onScreenshot?.()).catch((err) => {
      console.warn("Screenshot failed", err);
    }).finally(() => {
      setTimeout(() => {
        screenshotButton.disabled = false;
        screenshotButton.textContent = "📸 Screenshot";
      }, 250);
    });
  });

  document.addEventListener("click", (event) => {
    if (!controlsRoot.contains(event.target)) {
      setControlsOpen(false);
      return;
    }

    if (controlsRoot.dataset.open === "true") {
      controlPanels.forEach(({ panel, toggle }) => {
        if (
          panel.getAttribute("aria-hidden") === "false" &&
          !panel.contains(event.target) &&
          !toggle.contains(event.target)
        ) {
          closePanel(panel, toggle);
        }
      });
    }
  });

  applyVolume(currentVolume);
  onBindingsChange?.({ ...currentBindings });

  return {
    setGamepadStatus(text) {
      gamepadStatus.textContent = text || DEFAULT_STATUS;
    },
  };
}
