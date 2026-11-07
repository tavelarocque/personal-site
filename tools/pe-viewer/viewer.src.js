// protocol-emulator layout viewer. Loads layout.bin.gz (made by
// tools/gds2rects.py from the build's GDS and DEF) and draws every
// rectangle as an instance of one unit box. Renders only on change:
// nothing moves unless the reader moves it.
import {
  WebGLRenderer, Scene, PerspectiveCamera, BoxGeometry, InstancedBufferGeometry,
  InstancedBufferAttribute, ShaderMaterial, Mesh, Color, Vector3, Spherical,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const Z_EXAGGERATION = 20;   // stated in the caption
const AMBER = 0xffc53d;
// grey ramp by height; metals brighter than vias, devices darkest
const LAYER_STYLE = {
  Activ: 0x262626, GatPoly: 0x333333, Metal1: 0x474747, Via1: 0x3d3d3d,
  Metal2: 0x666666, Via2: 0x505050, Metal3: 0x8a8a8a, Via3: 0x5c5c5c, Metal4: 0xbdbdbd,
};
export const LAYER_COLORS = LAYER_STYLE;
// which metal level a layer sits on; vias ride on top of the metal below them
const LEVEL = { Activ: 0, GatPoly: 0, Metal1: 1, Via1: 1, Metal2: 2, Via2: 2, Metal3: 3, Via3: 3, Metal4: 4 };
export const DEFAULT_SPREAD = 40; // um added between metal levels, display only
const DEFAULT_ON = new Set(['Metal1', 'Via1', 'Metal2', 'Via2', 'Metal3', 'Via3', 'Metal4']);

const vert = /* glsl */`
  attribute vec4 rect;      // x0, y0, w, h in um, die centred
  uniform vec2 zr;          // z start, height (exaggerated)
  varying vec3 vN;
  void main() {
    vec3 p = position + 0.5;  // unit box, 0..1
    vec3 world = vec3(rect.x + p.x * rect.z, zr.x + p.z * zr.y, -(rect.y + p.y * rect.w));
    vN = normalize(vec3(normal.x, normal.z, -normal.y));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }`;
const frag = /* glsl */`
  uniform vec3 color;
  varying vec3 vN;
  void main() {
    vec3 L = normalize(vec3(0.35, 1.0, 0.55));
    float side = 0.34 + 0.24 * max(dot(vN, L), 0.0);
    float d = mix(side, 1.0, step(0.5, vN.y));
    gl_FragColor = vec4(color * d, 1.0);
    #include <colorspace_fragment>
  }`;

function readHeader(buf) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (magic !== 'PER2') throw new Error('unexpected file format ' + magic);
  const hl = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
  return { header, off: 8 + hl };
}

export async function decode(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('could not load layout (' + res.status + ')');
  const total = +res.headers.get('content-length') || 0;
  let loaded = 0;
  const chunks = [];
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); loaded += value.length; onProgress?.(loaded, total);
  }
  let bytes = new Uint8Array(loaded), o = 0;
  for (const c of chunks) { bytes.set(c, o); o += c.length; }
  // The file is gzip'd at build time. If a server already undid that with
  // Content-Encoding, the bytes arrive inflated; check the magic to decide.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  }
  const buf = bytes.buffer;
  const { header: h, off: start } = readHeader(buf);
  let off = start;
  const g = h.grid_um, cx = h.die_um[2] / 2, cy = h.die_um[3] / 2;
  const u32 = (n) => { const a = new Uint32Array(buf.slice(off, off + 4 * n)); off += 4 * n; return a; };
  const i32 = (n) => { const a = new Int32Array(buf.slice(off, off + 4 * n)); off += 4 * n; return a; };
  const u8 = (n) => { const a = new Uint8Array(buf, off, n); off += n; return a; };
  const names = h.layers.map((l) => l.name);

  const top = h.top_n.map((n) => { const dy = u32(n), x = u32(n), w = u32(n), hh = u32(n); return { n, dy, x, w, h: hh }; });
  const cells = h.cells.map((c) => c.n.map((n) => ({ n, x: i32(n), y: i32(n), w: i32(n), h: i32(n) })));
  const P = h.placements_n;
  const pc = u8(P).slice(), po = u8(P).slice();
  const pdy = u32(P), px = u32(P);
  const O = h.outlines_n;
  const ody = u32(O), ox = u32(O), ow = u32(O), oh = u32(O), og = u8(O);

  // count instances per layer
  const perCell = new Map();
  for (let i = 0; i < P; i++) perCell.set(pc[i], (perCell.get(pc[i]) || 0) + 1);
  const layers = names.map((name, li) => {
    let n = top[li].n;
    for (const [c, k] of perCell) n += cells[c][li].n * k;
    return { name, z: h.layers[li].z_um, hz: h.layers[li].h_um, rects: new Float32Array(n * 4), n: 0 };
  });

  for (let li = 0; li < names.length; li++) {
    const L = layers[li], t = top[li], R = L.rects;
    let y = 0, k = 0;
    for (let i = 0; i < t.n; i++) {
      y += t.dy[i];
      R[k++] = t.x[i] * g - cx; R[k++] = y * g - cy; R[k++] = t.w[i] * g; R[k++] = t.h[i] * g;
    }
    L.n = t.n;
    L.topN = t.n;
  }
  // expand placements: GDS order is reflect about x, rotate, translate
  let y = 0;
  for (let i = 0; i < P; i++) {
    if (i === 0 || pc[i] !== pc[i - 1]) y = 0;
    y += pdy[i];
    const c = cells[pc[i]], refl = po[i] & 1, rot = po[i] & 2;
    const X = px[i], Y = y;
    for (let li = 0; li < names.length; li++) {
      const cr = c[li];
      if (!cr.n) continue;
      const L = layers[li], R = L.rects;
      let k = L.n * 4;
      for (let j = 0; j < cr.n; j++) {
        let x0 = cr.x[j], y0 = cr.y[j]; const w = cr.w[j], hh = cr.h[j];
        if (refl) y0 = -(y0 + hh);
        if (rot) { x0 = -(x0 + w); y0 = -(y0 + hh); }
        R[k++] = (X + x0) * g - cx; R[k++] = (Y + y0) * g - cy; R[k++] = w * g; R[k++] = hh * g;
      }
      L.n += cr.n;
    }
  }
  const groups = h.outline_groups.map((name) => ({ name, rects: [], n: 0 }));
  y = 0;
  for (let i = 0; i < O; i++) {
    y += ody[i];
    const G = groups[og[i]];
    G.rects.push(ox[i] * g - cx, y * g - cy, ow[i] * g, oh[i] * g);
    G.n++;
  }
  for (const G of groups) G.rects = new Float32Array(G.rects);
  return { header: h, layers, groups };
}

function boxMesh(rects, n, z, hz, color) {
  const box = new BoxGeometry(1, 1, 1);
  const geo = new InstancedBufferGeometry();
  geo.index = box.index;
  geo.setAttribute('position', box.getAttribute('position'));
  geo.setAttribute('normal', box.getAttribute('normal'));
  geo.setAttribute('rect', new InstancedBufferAttribute(rects, 4));
  geo.instanceCount = n;
  const mat = new ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: { zr: { value: [z * Z_EXAGGERATION, hz * Z_EXAGGERATION] }, color: { value: new Color(color) } },
  });
  const m = new Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { return false; }
}

export function mount(container, data, ui) {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x0a0a0a, 1);
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new Scene();
  const meshes = {};
  for (const L of data.layers) {
    const m = boxMesh(L.rects, L.n, L.z, L.hz, LAYER_STYLE[L.name]);
    m.visible = DEFAULT_ON.has(L.name);
    meshes[L.name] = m;
    scene.add(m);
  }
  // die outline as a dark slab under everything
  const [x0, y0, x1, y1] = data.header.die_um;
  const W = x1 - x0, H = y1 - y0;
  scene.add(boxMesh(new Float32Array([-W / 2, -H / 2, W, H]), 1, -0.6, 0.5, 0x121212));
  // highlighted registers: amber columns through the full stack, so they read from above
  const highlight = {};
  for (const G of data.groups) {
    if (G.name === 'fill') continue;
    const m = boxMesh(G.rects, G.n, -0.1, 1, AMBER);
    m.visible = false;
    highlight[G.name] = m;
    scene.add(m);
  }
  const stackH = Math.max(...data.layers.map((l) => l.z + l.hz)) * Z_EXAGGERATION;
  let spread = DEFAULT_SPREAD;
  const topZ = () => stackH + 4 * spread;
  const applySpread = () => {
    for (const L of data.layers) {
      const lv = LEVEL[L.name];
      const z0 = L.z * Z_EXAGGERATION + lv * spread;
      const h = L.hz * Z_EXAGGERATION;
      meshes[L.name].material.uniforms.zr.value = [z0, h];
    }
    for (const k in highlight) highlight[k].material.uniforms.zr.value = [-2, topZ() + 6];
  };
  applySpread();

  // labels anchored to places the data identifies
  const centroid = (G) => {
    let sx = 0, sy = 0;
    for (let i = 0; i < G.n; i++) { sx += G.rects[4 * i] + G.rects[4 * i + 2] / 2; sy += G.rects[4 * i + 1] + G.rects[4 * i + 3] / 2; }
    return [sx / G.n, sy / G.n];
  };
  const group = Object.fromEntries(data.groups.map((g) => [g.name, g]));
  const fmt = (n) => n.toLocaleString('en-US');
  const tags = [];
  const addTag = (text, xy, key, priority, z = null, only = null) => tags.push({ text, short: text.split(' · ')[0].replace(' registers', ''), xy, key, priority, z, only });
  addTag('Program memory · ' + fmt(group.progmem.n) + ' flip-flops', centroid(group.progmem), 'progmem', 1);
  addTag('Thread 0 registers · ' + fmt(group.thread0.n), centroid(group.thread0), 'thread0', 1);
  addTag('Thread 1 registers · ' + fmt(group.thread1.n), centroid(group.thread1), 'thread1', 1);
  addTag('SPI host port · ' + fmt(group.host.n), centroid(group.host), 'host', 2);
  // a full-height Metal4 power strap near the right edge of the logic
  const m4 = data.layers.find((l) => l.name === 'Metal4');
  let strap = null;
  for (let i = 0; i < m4.topN; i++) {
    const x = m4.rects[4 * i], h = m4.rects[4 * i + 3];
    if (h > 0.8 * H && (!strap || Math.abs(x - W * 0.3) < Math.abs(strap - W * 0.3))) strap = x;
  }
  if (strap !== null) addTag('Power strap · Metal4', [strap, H * 0.36], null, 2);
  if (data.header.empty_region_um) {
    const [ex0, ey0, ex1, ey1] = data.header.empty_region_um;
    addTag('No logic cells', [(ex0 + ex1) / 2 - W / 2, (ey0 + ey1) / 2 - H / 2], null, 2);
  }
  const pm = centroid(group.progmem);
  const closeAnchor = [pm[0] - W * 0.085, pm[1] - H * 0.02];
  for (const L of data.layers) {
    if (!/^Metal/.test(L.name)) continue;
    addTag(L.name, closeAnchor, null, 1, () => L.z * Z_EXAGGERATION + LEVEL[L.name] * spread + L.hz * Z_EXAGGERATION, 'apart');
  }
  const tagLayer = document.createElement('div');
  tagLayer.className = 'tags';
  tagLayer.setAttribute('aria-hidden', 'true');
  container.appendChild(tagLayer);
  for (const t of tags) {
    t.el = document.createElement('div');
    t.el.className = 'tag';
    t.sp = document.createElement('span'); const sp = t.sp;
    sp.textContent = t.text;
    t.el.appendChild(sp);
    tagLayer.appendChild(t.el);
  }
  let showTags = true;
  const tmp = new Vector3();
  const placeTags = () => {
    const w = container.clientWidth, h = container.clientHeight;
    tagLayer.hidden = !showTags;
    if (!showTags) return;
    for (const t of tags) {
      if (t.only && t.only !== currentView) { t.el.style.display = 'none'; continue; }
      if (!t.only && currentView === 'apart') { t.el.style.display = 'none'; continue; }
      tmp.set(t.xy[0], t.z ? t.z() : topZ() + 8, -t.xy[1]).project(camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05 && (t.priority === 1 || w > 520);
      t.el.style.display = vis ? '' : 'none';
      if (!vis) continue;
      const label = w > 520 ? t.text : t.short;
      if (t.sp.textContent !== label) t.sp.textContent = label;
      const px = ((tmp.x + 1) / 2) * w, py = ((1 - tmp.y) / 2) * h;
      const tw = t.el.offsetWidth;
      // keep every label inside the frame: flip to the left of its dot near the right edge
      const flip = px + tw > w - 8 && px - tw + 8 >= 4;
      t.el.classList.toggle('flip', flip);
      const x = flip ? px - tw + 8 : Math.min(px, w - tw - 4);
      t.el.style.transform = `translate(${Math.max(4, x)}px, ${py}px)`;
    }
  };

  const camera = new PerspectiveCamera(35, 1, 1, 20000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minPolarAngle = 0.0;
  controls.minDistance = 20;
  controls.maxDistance = 4000;
  const frame = (el, az, zoom = 1) => {
    // fit the whole die from elevation el (radians above the plane) and azimuth az
    const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const fit = zoom * Math.max((W * (camera.aspect < 1.45 ? 0.66 : 0.5)) / Math.tan(hfov / 2), (H * 0.78) / Math.tan((camera.fov * Math.PI) / 360));
    controls.target.set(0, topZ() * 0.3, el > 1.4 ? 0 : H * 0.04);
    camera.position.set(fit * Math.cos(el) * Math.sin(az), controls.target.y + fit * Math.sin(el), controls.target.z + fit * Math.cos(el) * Math.cos(az));
    camera.up.set(0, 1, 0);
    controls.update();
  };
  const VIEWS = { angled: [0.96, -0.18], top: [1.5, 0, 0.92], apart: [0.42, -0.42, 1.08] };
  let currentView = 'angled';
  const closeUp = () => {
    const [cx, cy] = centroid(group.progmem);
    const d = W * 0.46, el = 0.62, az = -0.55;
    controls.target.set(cx, topZ() * 0.62, -cy);
    camera.position.set(cx + d * Math.cos(el) * Math.sin(az), controls.target.y + d * Math.sin(el), -cy + d * Math.cos(el) * Math.cos(az));
    controls.update();
  };
  const home = () => (currentView === 'apart' ? closeUp() : frame(...VIEWS[currentView]));
  home();

  let pending = false, moved = false;
  controls.addEventListener('start', () => { moved = true; });
  const render = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; renderer.render(scene, camera); placeTags(); });
  };
  controls.addEventListener('change', render);
  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!moved) home();
    render();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  // keyboard: arrows orbit, +/- zoom, R resets, digits toggle layers
  const sph = new Spherical(), off = new Vector3();
  const orbit = (dTheta, dPhi, scale = 1) => {
    moved = true;
    off.copy(camera.position).sub(controls.target);
    sph.setFromVector3(off);
    sph.theta += dTheta;
    sph.phi = Math.min(Math.max(sph.phi + dPhi, 0.05), controls.maxPolarAngle);
    sph.radius = Math.min(Math.max(sph.radius * scale, controls.minDistance), controls.maxDistance);
    off.setFromSpherical(sph);
    camera.position.copy(controls.target).add(off);
    camera.lookAt(controls.target);
    controls.update();
    render();
  };
  const api = {
    setLayer(name, on) { meshes[name].visible = on; render(); },
    setHighlight(name) { for (const k in highlight) highlight[k].visible = k === name; api.setHighlightTag(name); render(); },
    reset() { moved = false; currentView = 'angled'; home(); render(); },
    view(name) { moved = false; currentView = name; home(); render(); },
    setSpread(v) { spread = v; applySpread(); if (!moved) home(); render(); },
    setLabels(on) { showTags = on; render(); },
    setHighlightTag(key) { for (const t of tags) t.el.classList.toggle('on', !!key && t.key === key); },
    orbit,
    renderer, render,
  };
  container.addEventListener('keydown', (e) => {
    const step = 0.08;
    const k = e.key;
    if (k === 'ArrowLeft') orbit(-step, 0);
    else if (k === 'ArrowRight') orbit(step, 0);
    else if (k === 'ArrowUp') orbit(0, -step);
    else if (k === 'ArrowDown') orbit(0, step);
    else if (k === '+' || k === '=') orbit(0, 0, 0.85);
    else if (k === '-' || k === '_') orbit(0, 0, 1 / 0.85);
    else if (k === 'r' || k === 'R') api.reset();
    else if (/^[1-9]$/.test(k) && ui?.toggleIndex) ui.toggleIndex(+k - 1);
    else return;
    e.preventDefault();
  });
  render();
  return api;
}
