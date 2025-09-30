# LotR

Build system to generate Web Assembly (WASM) Emulator cores and run them from a self-hosted server

## Setup Steps

- [LotR](#lotr)
  - [Setup Steps](#setup-steps)
    - [Git Setup and Submodules](#git-setup-and-submodules)
    - [Emscripten Setup](#emscripten-setup)
  - [Running Emulators Locally](#running-emulators-locally)
    - [Building WASM Emulator Cores](#building-wasm-emulator-cores)
    - [Sourcing ROMs for WASM](#sourcing-roms-for-wasm)
    - [Serving the Site](#serving-the-site)
    - [Launching the Emulator](#launching-the-emulator)

### Git Setup and Submodules

    git clone --recursive https://github.com/projectcrayon/wasm-builder

### Emscripten Setup

A specific version of the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) is required.
Newer versions will usually cause build or runtime errors.

## Running Emulators Locally

The site (`./build`) is both the development sandbox and the Netlify publish directory. It needs to contain all
the relevant HTML, JS, and binaries required to launch an emulator. The HTML and plain JS portions are tracked in git.
The WASM bundles (see `make` instructions below) build into `./build/wasm` by default.

### Building WASM Emulator Cores

You can build a single core like this:

    make mesen -j8

The built core will be output to `./build/wasm`.

You can also build everything at once, though this mostly intended for the CI builders and is usually
a very slow process when iterating on WASM libretro changes since those force a rebuild of all emulators:

    make all -j8

### Sourcing ROMs for WASM

Assets for wasm come as .js/.data pairs and are generated via Emscripten's `file_packager.py`.

To package a ROM from an original binary or disc:

    python3 ~/emsdk/upstream/emscripten/tools/file_packager.py \
        "./build/rom.data" \
        --preload "./path/to/rom.bin@rom.bin" \
        --js-output "./build/rom.js"

### Serving the Site

Serve the content over HTTP, for example like this:

    python3 -m http.server 8000 --directory ./build

Or

    make serve

You can then open http://localhost:8000 in your browser of choice.

### Launching the Emulator

Your `build/index.html` will need to import the emulator and the ROM like this:

    <script src="Micro Mages.js"></script>
    <script src="mesen_libretro.js"></script>

And your `build/main.js` will need to launch the ROM:

    run("Micro Mages.nes");

The frontend listens to the Web Gamepad API, so standard controllers (DualSense, Xbox, etc.) Just Works™ alongside the keyboard bindings. Connect the pad before loading the page (or press any button to wake it) and use the bottom-right controls to fine-tune volume or remap the main gamepad buttons on the fly.

## Netlify Deployment

1. Activate the correct Emscripten SDK (`source ~/emsdk/emsdk_env.sh`) and rebuild the core you want to host, targeting the publish directory:

       make OUTDIR=./build/wasm blastem -j8

   Adjust the core name as needed; all generated `*_libretro.js/.wasm` files must end up in `build/wasm/`.
2. Package the ROM into the build directory so the static site has everything it needs (replace `./path/to/rom.bin` with your source ROM):

       python3 ~/emsdk/upstream/emscripten/tools/file_packager.py \
           "./build/rom.data" \
           --preload "./path/to/rom.bin@rom.bin" \
           --js-output "./build/rom.js"

3. Verify `build/index.html`, `build/main.js`, and the `build/vendors/` assets reference the freshly produced bundles. The project-level `netlify.toml` sets `publish = "build"` and configures the MIME headers for WASM/Data files.
4. Deploy with the Netlify CLI:

       netlify deploy --dir=build            # preview deploy
       netlify deploy --prod --dir=build     # production deploy

   If you trigger builds from the Netlify UI, set the Publish directory to `build` so it matches the checked-in configuration.
