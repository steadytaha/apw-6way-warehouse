# Third-party notices

| Component | Version | Licence | How it is used | Source |
|---|---|---|---|---|
| Pyodide (CPython compiled to WebAssembly) | 0.26.4 | MPL-2.0 (licence text: https://github.com/pyodide/pyodide/blob/0.26.4/LICENSE; the npm package metadata says Apache-2.0, the repository licence file is MPL-2.0) | **Served from this site** (`pyodide/`: pyodide.js, pyodide.mjs, pyodide.asm.js, pyodide.asm.wasm, python_stdlib.zip, pyodide-lock.json), unmodified, from the official npm package (integrity checked) | https://pyodide.org , https://github.com/pyodide/pyodide |
| CPython 3.12 runtime and standard library (inside Pyodide) | 3.12.1 | PSF License | inside the Pyodide files above | https://www.python.org |
| three.js (3D scene) | 0.186.0 | MIT (Copyright 2010-2026 three.js authors; licence text: https://github.com/mrdoob/three.js/blob/r186/LICENSE) | **Served from this site** (`vendor/three/`: build/three.module.js, build/three.core.js, examples/jsm/controls/OrbitControls.js, examples/jsm/utils/BufferGeometryUtils.js), unmodified, from the official npm package (integrity checked, SRI kept) | https://threejs.org |

Pyodide's own dependencies (Emscripten runtime and others) keep their licences; see the Pyodide repository. No Pyodide packages (numpy etc.) are shipped: the model uses the Python standard library only.
The model refers to published papers and standards by citation and link only; no third-party text or figures are included.
