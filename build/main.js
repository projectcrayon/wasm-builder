import Video from "./vendors/Video.js";
import Audio from "./vendors/Audio.js";
import { initControls } from "./controls.js";
import { InputManager, NO_GAMEPAD_STATUS } from "./input-manager.js";
import { NotificationManager } from "./notifications.js";

const Module = window.Module || (window.Module = {});
const ROM_FILE = "rom.bin";

const inputManager = new InputManager({ moduleRef: Module });
let currentVolume = 0.5;
const notifications = new NotificationManager();

function bootstrap() {
  const { setGamepadStatus } = initControls({
    onVolumeChange(volume) {
      currentVolume = volume;
      if (Module.audio) {
        Module.audio.volume = volume;
      }
    },
    onBindingsChange(bindings) {
      inputManager.updateBindings(bindings);
    },
    onScreenshot() {
      captureScreenshot();
    },
  });

  inputManager.setGamepadStatusCallback((text) => {
    setGamepadStatus(text ?? NO_GAMEPAD_STATUS);
  });
  setGamepadStatus(NO_GAMEPAD_STATUS);

  startGame();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}

function startGame() {
  const run = () => runGame(ROM_FILE);
  if (document.readyState === "complete") {
    run();
  } else {
    window.addEventListener("load", run, { once: true });
  }
}

function runGame(gamePath) {
  const canvas = document.querySelector("#screen");
  if (!canvas) throw new Error("Canvas with id 'screen' not found");

  const video = new Video(canvas);
  const audio = new Audio();

  Module.video = video;
  Module.audio = audio;
  Module.audio.volume = currentVolume;

  libretro(Module).then((retro) => {
    retro.loadGame(gamePath);

    try {
      const infoMap = retro.env_controller_info?.[0];
      if (infoMap && typeof infoMap.keys === "function") {
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
          chosenName = [...infoMap.keys()][0];
        }
        const controllerId = infoMap.get(chosenName);
        if (controllerId != null) {
          retro.setControllerPortDevice(0, controllerId);
          console.log("Controller set:", chosenName, controllerId);
        }
      }
    } catch (err) {
      console.warn("Controller selection skipped:", err);
    }

    inputManager.attachRetro(retro);

    if (retro.skip_frame) {
      retro.skip_frame(1);
    }

    retro.loop(-1);
  });
}

async function captureScreenshot() {
  const canvas = document.querySelector("#screen");
  if (!canvas) {
    const error = new Error("Screenshot aborted: canvas not found");
    console.warn(error.message);
    throw error;
  }

  await new Promise((resolve) => requestAnimationFrame(resolve));

  const dataURL = canvas.toDataURL("image/png");
  const response = await fetch(dataURL);
  const blob = await response.blob();

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  const link = document.createElement("a");
  link.href = dataURL;
  link.download = `arcana-mundi-${timestamp}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    notifications.show({
      message: "Screenshot copied to clipboard",
      icon: "📋",
    });
  } catch (err) {
    console.warn("Clipboard copy failed", err);
    notifications.show({
      message: "Screenshot saved locally",
      icon: "⚠️",
    });
  }
}
