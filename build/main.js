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
let resetClipButtonState = () => {};
let clipRecorder = null;
let clipStream = null;
let clipChunks = [];
let clipMimeType = "video/webm";
let clipVideoTracks = [];

const LOG_BUFFER = [];
const MAX_LOG_ENTRIES = 300;

function bootstrap() {
  patchConsole();

  const { setGamepadStatus, resetClipState } = initControls({
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
    onClipStart() {
      return startClipRecording();
    },
    onClipStop() {
      return stopClipRecording();
    },
    onExportLogs() {
      exportLogs();
    },
  });

  resetClipButtonState = resetClipState;

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
  ensureAudioContext(audio);

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

async function startClipRecording() {
  if (clipRecorder) {
    throw new Error("A clip recording is already in progress");
  }

  const canvas = document.querySelector("#screen");
  if (!canvas) {
    notifications.show({ icon: "⚠️", message: "Clip failed: canvas missing" });
    throw new Error("Canvas missing");
  }

  const captureStream =
    canvas.captureStream?.(60) || canvas.captureStream?.() || canvas.mozCaptureStream?.(60);

  if (!captureStream) {
    notifications.show({
      icon: "⚠️",
      message: "Clip recording not supported in this browser",
    });
    throw new Error("captureStream not supported");
  }

  const audioStream = Module.audio?.getMediaStream?.();
  const combinedStream = new MediaStream();

  clipVideoTracks = captureStream.getVideoTracks();
  clipVideoTracks.forEach((track) => combinedStream.addTrack(track));

  const audioTracks = audioStream?.getAudioTracks?.() || [];
  audioTracks.forEach((track) => combinedStream.addTrack(track));

  if (audioTracks.length === 0) {
    notifications.show({ icon: "ℹ️", message: "Clip will be video-only" });
  }

  const stream = combinedStream;
  clipChunks = [];

  const mimeCandidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];

  let recorder;
  for (const mime of mimeCandidates) {
    if (typeof MediaRecorder === "undefined") break;
    if (MediaRecorder.isTypeSupported && !MediaRecorder.isTypeSupported(mime)) continue;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime });
      clipMimeType = mime;
      break;
    } catch (err) {
      continue;
    }
  }

  if (!recorder) {
    clipVideoTracks.forEach((track) => track.stop());
    clipVideoTracks = [];
    notifications.show({
      icon: "⚠️",
      message: "MediaRecorder not supported",
    });
    throw new Error("Unable to create MediaRecorder");
  }

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      clipChunks.push(event.data);
    }
  };

  recorder.onerror = (event) => {
    console.warn("Clip recorder error", event.error);
    notifications.show({ icon: "⚠️", message: "Clip recording error" });
  };

  try {
    recorder.start();
  } catch (err) {
    clipVideoTracks.forEach((track) => track.stop());
    clipVideoTracks = [];
    notifications.show({ icon: "⚠️", message: "Unable to start clip recording" });
    throw err;
  }

  clipRecorder = recorder;
  clipStream = stream;

  notifications.show({ icon: "⏺️", message: "Clip recording started" });
}

function patchConsole() {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  const appendLog = (level, args) => {
    const timestamp = new Date().toISOString();
    const message = args
      .map((item) => {
        if (typeof item === "object") {
          try {
            return JSON.stringify(item);
          } catch (err) {
            return String(item);
          }
        }
        return String(item);
      })
      .join(" ");
    LOG_BUFFER.push({ timestamp, level, message });
    if (LOG_BUFFER.length > MAX_LOG_ENTRIES) {
      LOG_BUFFER.shift();
    }
  };

  ["log", "info", "warn", "error"].forEach((level) => {
    console[level] = (...args) => {
      appendLog(level, args);
      original[level](...args);
    };
  });
}

function exportLogs() {
  const contextInfo = {
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    clipRecording: Boolean(clipRecorder),
    volume: currentVolume,
  };

  const header = [
    "Arcana Mundi Log Export",
    `Exported: ${contextInfo.timestamp}`,
    `URL: ${contextInfo.url}`,
    `User-Agent: ${contextInfo.userAgent}`,
    `Clip recording active: ${contextInfo.clipRecording}`,
    `Volume: ${contextInfo.volume.toFixed(2)}`,
    "",
    "Entries:",
    "",
  ].join("\n");

  const lines = LOG_BUFFER.map(
    ({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]\n${message}\n`
  );

  const blob = new Blob([header, ...lines], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `arcana-mundi-logs-${contextInfo.timestamp.replace(/[:.]/g, "-")}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  notifications.show({ icon: "📄", message: "Logs exported" });
}

async function stopClipRecording() {
  if (!clipRecorder) {
    throw new Error("No active clip recording");
  }

  const recorder = clipRecorder;
  const stream = clipStream;
  clipRecorder = null;
  clipStream = null;

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      try {
        const blob = new Blob(clipChunks, { type: clipMimeType });
        clipChunks = [];
        const url = URL.createObjectURL(blob);
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-");
        const link = document.createElement("a");
        link.href = url;
        link.download = `arcana-mundi-${timestamp}.webm`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        notifications.show({ icon: "💾", message: "Clip saved (webm)" });
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        clipVideoTracks.forEach((track) => track.stop());
        clipVideoTracks = [];
        clipChunks = [];
        resetClipButtonState();
      }
    };

    recorder.onerror = (event) => {
      clipVideoTracks.forEach((track) => track.stop());
      clipVideoTracks = [];
      clipChunks = [];
      notifications.show({ icon: "⚠️", message: "Clip recording failed" });
      resetClipButtonState();
      reject(event.error || new Error("Recorder error"));
    };

    try {
      recorder.stop();
    } catch (err) {
      recorder.onstop = null;
      recorder.onerror = null;
      clipVideoTracks.forEach((track) => track.stop());
      clipVideoTracks = [];
      clipChunks = [];
      notifications.show({ icon: "⚠️", message: "Unable to stop clip" });
      resetClipButtonState();
      reject(err);
    }
  });
}

function ensureAudioContext(audio) {
  const ctx = audio?.ctx;
  if (!ctx) return;

  const tryResume = () => {
    if (ctx.state === "running") {
      cleanup();
      return;
    }
    ctx.resume().catch(() => {});
  };

  let intervalId;
  const cleanup = () => {
    document.removeEventListener("pointerdown", tryResume, true);
    document.removeEventListener("keydown", tryResume, true);
    if (intervalId != null) {
      clearInterval(intervalId);
    }
  };

  document.addEventListener("pointerdown", tryResume, true);
  document.addEventListener("keydown", tryResume, true);
  intervalId = setInterval(tryResume, 2000);
  tryResume();
}
