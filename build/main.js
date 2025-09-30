// All comments in English as requested.

import Video from "./vendors/Video.js";
import Audio from "./vendors/Audio.js";

const mapping = {
  KeyZ: 0, // RETRO_DEVICE_ID_JOYPAD_B
  KeyA: 1, // RETRO_DEVICE_ID_JOYPAD_Y
  ShiftRight: 2, // RETRO_DEVICE_ID_JOYPAD_SELECT
  Enter: 3, // RETRO_DEVICE_ID_JOYPAD_START
  ArrowUp: 4, // RETRO_DEVICE_ID_JOYPAD_UP
  ArrowDown: 5, // RETRO_DEVICE_ID_JOYPAD_DOWN
  ArrowLeft: 6, // RETRO_DEVICE_ID_JOYPAD_LEFT
  ArrowRight: 7, // RETRO_DEVICE_ID_JOYPAD_RIGHT
  KeyX: 8, // RETRO_DEVICE_ID_JOYPAD_A
  KeyS: 9, // RETRO_DEVICE_ID_JOYPAD_X
  KeyQ: 10, // RETRO_DEVICE_ID_JOYPAD_L
  KeyW: 11, // RETRO_DEVICE_ID_JOYPAD_R
};

let sram = null;
let savestate = null;
let paused = false;
let audioUnlockHandlersBound = false;

function unlockAudioContext() {
  const ctx = Module.audio?.ctx;
  if (!ctx) return;
  if (ctx.state !== "suspended") return;
  ctx.resume().catch((err) => {
    console.warn("Audio context resume blocked:", err);
  });
}

function listenKeyboard(retro) {
  if (!audioUnlockHandlersBound) {
    window.addEventListener("pointerdown", unlockAudioContext, { once: true });
    audioUnlockHandlersBound = true;
  }

  window.addEventListener("keydown", (e) => {
    const volumePanel = document.getElementById("volumePanel");
    const volumeToggle = document.getElementById("volumeToggle");

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

    // Prevent default to avoid scrolling etc.
    e.preventDefault();
    unlockAudioContext();
    if (Object.prototype.hasOwnProperty.call(mapping, e.code)) {
      retro.input_user_state[0][mapping[e.code]] = true;
    }
  });

  window.addEventListener("keyup", (e) => {
    const volumePanel = document.getElementById("volumePanel");
    if (
      volumePanel &&
      volumePanel.getAttribute("aria-hidden") === "false" &&
      volumePanel.contains(e.target)
    ) {
      return;
    }
    e.preventDefault();
    if (Object.prototype.hasOwnProperty.call(mapping, e.code)) {
      retro.input_user_state[0][mapping[e.code]] = false;
    }
  });

  window.addEventListener("keydown", (e) => {
    const volumePanel = document.getElementById("volumePanel");
    const volumeToggle = document.getElementById("volumeToggle");

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
    e.preventDefault();
    if (e.code === "KeyF") {
      const wrapper = document.querySelector("#wrapper");
      wrapper.webkitRequestFullScreen && wrapper.webkitRequestFullScreen();
      wrapper.mozRequestFullScreen && wrapper.mozRequestFullScreen();
      wrapper.requestFullscreen && wrapper.requestFullscreen();
    }
    if (e.code === "KeyR") {
      // Reset
      retro.reset();
      if (sram !== null && sram.length > 0) retro.setSRAM(sram);
    }
    if (e.code === "KeyY") {
      // Save state
      savestate = retro.getState();
    }
    if (e.code === "KeyU") {
      // Load state
      retro.setState(savestate);
    }
    if (e.code === "KeyG") {
      // Screenshot
      const canvas = document.querySelector("#screen");
      const dataURL = canvas.toDataURL("image/png");
      console.log("Screenshot data URL:", dataURL);
      const img = document.createElement("img");
      img.src = dataURL;
      document.body.appendChild(img);
    }
    if (e.code === "KeyH") {
      // Savefile (SRAM)
      sram = retro.getSRAM();
      console.log("SRAM length:", sram?.length ?? 0);
    }
    if (e.code === "KeyP") {
      // Pause/resume
      paused = !paused;
      console.log("Paused:", paused);
      retro.setPaused(paused);
    }
    if (e.code === "Escape") {
      const panel = document.getElementById("volumePanel");
      const toggle = document.getElementById("volumeToggle");
      if (panel && panel.getAttribute("aria-hidden") === "false") {
        panel.setAttribute("aria-hidden", "true");
        toggle?.setAttribute("aria-expanded", "false");
        return;
      }
      // Unload game on explicit request
      retro.unloadGame();
    }
  });
}

// Export run() globally so index.html can call it.
window.run = function (gamePath) {
  const canvas = document.querySelector("#screen");
  const video = new Video(canvas);
  const audio = new Audio();

  if (typeof window.arcanaVolume === "number") {
    const presetVolume = Math.min(Math.max(window.arcanaVolume, 0), 1);
    audio.volume = presetVolume;
  }

  // Wire video/audio for the libretro runtime
  Module.video = video;
  Module.audio = audio;

  // Load the BlastEm core (injected by blastem_libretro.js)
  libretro(Module).then((retro) => {
    // Remove NES-specific options. If you need BlastEm options, set them here, e.g.:
    // retro.setOptions("blastem_region", "auto"); // example key if supported

    // Load packaged ROM file
    retro.loadGame(gamePath);

    // Optional: pick a suitable controller if core exposes choices.
    // If unknown, fallback to the first available option.
    try {
      const infoMap = retro.env_controller_info?.[0];
      if (infoMap && typeof infoMap.keys === "function") {
        // Try common Genesis/Mega Drive names in order
        const preferredNames = [
          "Sega Mega Drive 6 Button Pad",
          "Sega Mega Drive Controller",
          "Sega Genesis 6 Button Pad",
          "Sega Genesis Controller",
          "MD Joypad 6 Button",
          "MD Joypad 3 Button",
        ];
        let chosenName = null;
        for (const name of preferredNames) {
          if (infoMap.has(name)) {
            chosenName = name;
            break;
          }
        }
        if (!chosenName) {
          const first = [...infoMap.keys()][0];
          chosenName = first;
        }
        const controllerId = infoMap.get(chosenName);
        if (controllerId != null) {
          retro.setControllerPortDevice(0, controllerId);
          console.log("Controller set:", chosenName, controllerId);
        }
      }
    } catch (e) {
      console.warn("Controller selection skipped:", e);
    }

    listenKeyboard(retro);

    if (retro.skip_frame) {
      // keep a single frame for testing purpose (optional)
      retro.skip_frame(1);
    }

    // Start the main loop
    retro.loop(-1);

    unlockAudioContext();
  });
};
