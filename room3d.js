// Makeoverly 3D room: builds an interactive Three.js interior from a layout that Gemini reads
// out of the design and its other camera views (room size, walls, openings, furniture, colors).
// Coordinates: meters, origin at the floor center; x to the right and z toward the camera of the
// main design photo, so the back wall is at z = -depth/2. Rotation 0 means an object faces +z.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const WALLS = ['back', 'left', 'right', 'front'];
const WALL_TYPES = ['artwork', 'mirror', 'tv', 'curtains', 'shelf', 'wall_light'];
const HEX = /^#[0-9a-f]{6}$/i;

const num = (v, min, max, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
const color = (v, dflt) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : dflt);

// Clean up whatever the model returned so the builder never meets missing or absurd values
export function normalize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const room = r.room || {};
  const W = num(room.width, 2.5, 14, 5);
  const D = num(room.depth, 2.5, 14, 4.5);
  const H = num(room.height, 2.3, 6, 2.8);
  const walls = r.walls || {};
  const wallColor = color(walls.default || r.wall_color, '#EDE6DA');
  const spec = {
    W, D, H,
    walls: Object.fromEntries(WALLS.map(w => [w, color(walls[w], wallColor)])),
    floor: {
      material: ['wood', 'tile', 'stone', 'marble', 'carpet', 'concrete'].includes((r.floor || {}).material) ? r.floor.material : 'wood',
      color: color((r.floor || {}).color, '#B8916A')
    },
    ceiling: color(r.ceiling_color, '#F7F4EE'),
    trim: color(r.trim_color, '#F4F0E8'),
    time: ['day', 'golden', 'evening'].includes(r.time_of_day) ? r.time_of_day : 'day',
    openings: [],
    objects: []
  };
  const wallLen = w => (w === 'back' || w === 'front' ? W : D);
  (Array.isArray(r.openings) ? r.openings : []).slice(0, 10).forEach(o => {
    const wall = WALLS.includes(o.wall) ? o.wall : 'back';
    const L = wallLen(wall);
    const type = ['window', 'door', 'arch', 'opening'].includes(o.type) ? o.type : 'window';
    const width = num(o.width, 0.4, L - 0.2, type === 'door' ? 0.9 : 1.4);
    const sill = type === 'window' ? num(o.sill, 0, H - 0.6, 0.8) : 0;
    const height = num(o.height, 0.5, H - sill - 0.08, type === 'window' ? 1.5 : 2.15);
    const offset = num(o.offset, 0.05, L - width - 0.05, (L - width) / 2);
    spec.openings.push({ wall, type, width, height, sill, offset, frame: color(o.frame_color, type === 'door' ? '#8A6A4F' : '#2E2B28') });
  });
  (Array.isArray(r.objects) ? r.objects : []).slice(0, 40).forEach(o => {
    const type = String(o.type || 'box').toLowerCase().replace(/\s+/g, '_');
    const item = {
      type,
      w: num(o.width, 0.1, Math.max(W, D), 0.8),
      d: num(o.depth, 0.02, Math.max(W, D), 0.6),
      h: num(o.height, 0.01, H, 0.8),
      y: num(o.y, 0, H - 0.05, 0),
      rot: num(o.rotation, -360, 360, 0) * Math.PI / 180,
      c1: color(o.color, '#C9B9A6'),
      c2: color(o.secondary_color, '#6B5B4B'),
      material: String(o.material || '').toLowerCase(),
      shape: o.shape === 'round' ? 'round' : 'rect'
    };
    if (WALL_TYPES.includes(type)) {
      item.wall = WALLS.includes(o.wall) ? o.wall : 'back';
      const L = wallLen(item.wall);
      item.w = Math.min(item.w, L - 0.1);
      item.offset = num(o.offset, 0, L - item.w, (L - item.w) / 2);
      if (!o.y && type !== 'curtains') item.y = type === 'tv' ? 1.0 : 1.2;
    } else {
      item.x = num(o.x, -W / 2 + item.w / 4, W / 2 - item.w / 4, 0);
      item.z = num(o.z, -D / 2 + item.d / 4, D / 2 - item.d / 4, 0);
    }
    spec.objects.push(item);
  });
  return spec;
}

// Small seeded random so every rebuild of the same room looks the same
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shade(hex, l) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, l);
  return c;
}

function material(hex, kind) {
  const k = kind || '';
  if (/metal|brass|gold|steel|chrome|iron/.test(k)) return new THREE.MeshStandardMaterial({ color: hex, metalness: 0.75, roughness: 0.35 });
  if (/glass/.test(k)) return new THREE.MeshStandardMaterial({ color: hex, transparent: true, opacity: 0.35, roughness: 0.05 });
  if (/marble|stone|ceramic|lacquer|gloss/.test(k)) return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.3 });
  if (/leather/.test(k)) return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55 });
  if (/wood|oak|walnut|rattan|cane/.test(k)) return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7 });
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92 });
}

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function floorTexture(kind, hex, rand) {
  const base = new THREE.Color(hex);
  const css = c => '#' + c.getHexString();
  return canvasTexture(512, (g, s) => {
    g.fillStyle = css(base);
    g.fillRect(0, 0, s, s);
    if (kind === 'wood') {
      const rows = 8, h = s / rows;
      for (let r = 0; r < rows; r++) {
        let x = -rand() * s;
        while (x < s) {
          const len = s * (0.45 + rand() * 0.5);
          g.fillStyle = css(base.clone().offsetHSL(0, (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.07));
          g.fillRect(x, r * h, len, h);
          g.strokeStyle = 'rgba(0,0,0,0.05)';
          for (let i = 0; i < 5; i++) { g.beginPath(); const yy = r * h + rand() * h; g.moveTo(x, yy); g.lineTo(x + len, yy + (rand() - 0.5) * 4); g.stroke(); }
          g.fillStyle = 'rgba(0,0,0,0.18)';
          g.fillRect(x, r * h, 2, h);
          x += len;
        }
        g.fillStyle = 'rgba(0,0,0,0.16)';
        g.fillRect(0, r * h, s, 2);
      }
    } else if (kind === 'tile') {
      g.strokeStyle = css(base.clone().offsetHSL(0, 0, 0.12));
      g.lineWidth = 4;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); }
    } else if (kind === 'stone' || kind === 'marble') {
      g.strokeStyle = 'rgba(90,90,90,0.18)';
      for (let i = 0; i < 9; i++) {
        g.lineWidth = 0.6 + rand() * 1.6;
        g.beginPath(); g.moveTo(rand() * s, 0);
        g.bezierCurveTo(rand() * s, s * 0.3, rand() * s, s * 0.7, rand() * s, s);
        g.stroke();
      }
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
      for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * s / 2, 0); g.lineTo(i * s / 2, s); g.moveTo(0, i * s / 2); g.lineTo(s, i * s / 2); g.stroke(); }
    } else {
      for (let i = 0; i < 6000; i++) {
        g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        g.fillRect(rand() * s, rand() * s, 2, 2);
      }
    }
  });
}

export async function buildRoom(container, rawSpec, opts = {}) {
  const spec = normalize(rawSpec);
  const { W, D, H } = spec;
  const mobile = !!opts.mobile;
  const rand = seeded(Math.round(W * 1000 + D * 100 + spec.objects.length));

  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = spec.time === 'evening' ? 0.9 : 1.05;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#EFE8DD');
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 100);

  // Walls with real holes for windows, doors and arches; each wall is a group so it can hide in dollhouse view
  const wallGroups = {};
  const T = 0.12;
  const wallLen = w => (w === 'back' || w === 'front' ? W : D);
  const place = {
    back: g => { g.position.set(-W / 2, 0, -D / 2 - T); },
    left: g => { g.rotation.y = Math.PI / 2; g.position.set(-W / 2 - T, 0, D / 2); },
    right: g => { g.rotation.y = -Math.PI / 2; g.position.set(W / 2 + T, 0, -D / 2); },
    front: g => { g.rotation.y = Math.PI; g.position.set(W / 2, 0, D / 2 + T); }
  };
  const trimMat = material(spec.trim, 'paint');
  WALLS.forEach(w => {
    const L = wallLen(w);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(L, 0); shape.lineTo(L, H); shape.lineTo(0, H); shape.lineTo(0, 0);
    const g = new THREE.Group();
    spec.openings.filter(o => o.wall === w).forEach(o => {
      const x0 = o.offset, x1 = o.offset + o.width, y0 = o.sill, y1 = o.sill + o.height;
      const hole = new THREE.Path();
      if (o.type === 'arch') {
        const r = o.width / 2;
        const yb = Math.max(y0 + 0.2, y1 - r);
        hole.moveTo(x0, y0); hole.lineTo(x1, y0); hole.lineTo(x1, yb);
        hole.absarc(x0 + r, yb, r, 0, Math.PI, false);
        hole.lineTo(x0, y0);
      } else {
        hole.moveTo(x0, y0); hole.lineTo(x1, y0); hole.lineTo(x1, y1); hole.lineTo(x0, y1); hole.lineTo(x0, y0);
      }
      shape.holes.push(hole);
      const cx = (x0 + x1) / 2;
      if (o.type === 'window' || o.type === 'arch') {
        // Bright "outside" panel plus frame and mullions
        const sky = new THREE.Mesh(new THREE.PlaneGeometry(o.width, o.height),
          new THREE.MeshBasicMaterial({ color: spec.time === 'evening' ? '#30405A' : spec.time === 'golden' ? '#F6D9A8' : '#E8F1F6' }));
        sky.position.set(cx, (y0 + y1) / 2, -0.02);
        g.add(sky);
        const fm = material(o.frame, 'metal');
        const bar = (bw, bh, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.05), fm); m.position.set(x, y, T * 0.5); g.add(m); };
        if (o.type === 'window') {
          bar(o.width, 0.05, cx, y0); bar(o.width, 0.05, cx, y1); bar(0.05, o.height, x0, (y0 + y1) / 2); bar(0.05, o.height, x1, (y0 + y1) / 2);
          bar(0.035, o.height, cx, (y0 + y1) / 2); bar(o.width, 0.035, cx, y0 + o.height * 0.6);
          const sill = new THREE.Mesh(new THREE.BoxGeometry(o.width + 0.12, 0.04, 0.22), trimMat);
          sill.position.set(cx, y0 - 0.02, T + 0.06); g.add(sill);
        } else {
          bar(0.035, o.height * 0.75, cx, y0 + o.height * 0.37);
        }
      } else if (o.type === 'door') {
        const door = new THREE.Mesh(new THREE.BoxGeometry(o.width - 0.04, o.height - 0.02, 0.05), material(o.frame, 'wood'));
        door.position.set(cx, y0 + o.height / 2, T * 0.4);
        door.castShadow = true;
        g.add(door);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), material('#B89B5E', 'brass'));
        knob.position.set(x1 - 0.12, 1.0, T * 0.4 + 0.05); g.add(knob);
      } else {
        const beyond = new THREE.Mesh(new THREE.PlaneGeometry(o.width, o.height), new THREE.MeshStandardMaterial({ color: shade(spec.walls[w], -0.18), roughness: 1 }));
        beyond.position.set(cx, (y0 + y1) / 2, -0.6); g.add(beyond);
      }
    });
    const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
    const mesh = new THREE.Mesh(geo, material(spec.walls[w], 'paint'));
    mesh.receiveShadow = true;
    g.add(mesh);
    // Skirting board along the bottom
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(L, 0.09, 0.015), trimMat);
    skirt.position.set(L / 2, 0.045, T + 0.008); g.add(skirt);
    place[w](g);
    wallGroups[w] = g;
    scene.add(g);
  });

  const floorTex = floorTexture(spec.floor.material, spec.floor.color, rand);
  floorTex.repeat.set(W / 2, D / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({
    map: floorTex, roughness: spec.floor.material === 'marble' || spec.floor.material === 'tile' ? 0.35 : spec.floor.material === 'carpet' ? 1 : 0.75
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), material(spec.ceiling, 'paint'));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  scene.add(ceiling);

  // Light: sky fill, a sun through the main window wall, warm lamps
  const evening = spec.time === 'evening', golden = spec.time === 'golden';
  scene.add(new THREE.HemisphereLight(evening ? '#B9C4DA' : '#FFFFFF', '#C9B49A', evening ? 0.35 : 0.9));
  scene.add(new THREE.AmbientLight('#FFFFFF', evening ? 0.15 : 0.3));
  const sunWall = (spec.openings.find(o => o.type === 'window') || {}).wall || 'left';
  const out = { back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], front: [0, 0, 1] }[sunWall];
  const sun = new THREE.DirectionalLight(golden ? '#FFD6A0' : evening ? '#8EA2C8' : '#FFF6E8', evening ? 0.4 : golden ? 2.2 : 1.8);
  sun.position.set(out[0] * (W + 3), H + 2.5, out[2] * (D + 3) + 1);
  sun.target.position.set(0, 0, 0);
  if (!mobile) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = Math.max(W, D);
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: s * 4 });
    sun.shadow.bias = -0.0005;
  }
  scene.add(sun, sun.target);

  let lamps = 0;
  const lamp = (x, y, z, strength) => {
    if (lamps >= 4) return;
    lamps++;
    const l = new THREE.PointLight('#FFC98A', (evening ? 3 : 1.2) * strength, 6, 1.6);
    l.position.set(x, y, z);
    scene.add(l);
  };

  // ---------- Furniture builders (local space: front faces +z, sits on y = 0) ----------
  const rbox = (w, h, d, mat, r) => new THREE.Mesh(new RoundedBoxGeometry(Math.max(w, 0.02), Math.max(h, 0.02), Math.max(d, 0.02), 3, Math.min(r ?? 0.03, w / 2.2, h / 2.2, d / 2.2)), mat);
  const boxm = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01)), mat);
  const cyl = (rt, rb, h, mat, seg) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 20), mat);
  const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); return mesh; };
  const legsFor = (g, w, d, h, mat, inset) => {
    const i = inset ?? 0.06;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => g.add(at(cyl(0.018, 0.014, h, mat, 8), sx * (w / 2 - i), h / 2, sz * (d / 2 - i))));
  };

  const B = {
    sofa(o, g, seats) {
      const fab = material(o.c1, o.material || 'fabric');
      const cushion = material(shade(o.c1, 0.04), 'fabric');
      const legMat = material('#3A3029', 'wood');
      const leg = 0.08, seatTop = Math.max(0.36, o.h * 0.52), arm = Math.min(0.2, o.w * 0.12);
      g.add(at(rbox(o.w, seatTop - leg - 0.1, o.d, fab, 0.05), 0, leg + (seatTop - leg - 0.1) / 2, 0));
      const n = seats || (o.w > 1.9 ? 3 : 2);
      const cw = (o.w - 2 * arm) / n;
      for (let i = 0; i < n; i++) g.add(at(rbox(cw - 0.02, 0.12, o.d * 0.78, cushion, 0.05), -o.w / 2 + arm + cw * (i + 0.5), seatTop - 0.06, o.d * 0.09));
      g.add(at(rbox(o.w, o.h - leg, o.d * 0.24, fab, 0.06), 0, leg + (o.h - leg) / 2, -o.d / 2 + o.d * 0.12));
      [-1, 1].forEach(s => g.add(at(rbox(arm, o.h * 0.7 - leg, o.d, fab, 0.06), s * (o.w / 2 - arm / 2), leg + (o.h * 0.7 - leg) / 2, 0)));
      if (n > 1) [-1, 1].forEach(s => g.add(at(rbox(0.42, 0.4, 0.13, material(o.c2, 'fabric'), 0.06), s * (o.w / 2 - arm - 0.3), seatTop + 0.17, -o.d / 2 + o.d * 0.3)));
      legsFor(g, o.w, o.d, leg, legMat, 0.08);
    },
    armchair(o, g) { B.sofa(o, g, 1); },
    chair(o, g) {
      const m = material(o.c1, o.material || 'fabric'), legM = material(o.c2, o.material.includes('metal') ? 'metal' : 'wood');
      const seat = 0.46;
      g.add(at(rbox(o.w, 0.06, o.d, m, 0.02), 0, seat, 0));
      g.add(at(rbox(o.w, Math.max(0.3, o.h - seat), 0.05, m, 0.02), 0, seat + Math.max(0.3, o.h - seat) / 2, -o.d / 2 + 0.03));
      legsFor(g, o.w, o.d, seat - 0.03, legM, 0.04);
    },
    stool(o, g) {
      const m = material(o.c1, o.material || 'wood');
      g.add(at(cyl(o.w / 2, o.w / 2, 0.05, m), 0, o.h - 0.025, 0));
      legsFor(g, o.w * 0.7, o.w * 0.7, o.h - 0.05, material(o.c2, 'metal'), 0.02);
    },
    table(o, g) {
      const top = material(o.c1, o.material || 'wood'), base = material(o.c2, o.material || 'wood');
      const t = 0.04;
      if (o.shape === 'round') {
        g.add(at(cyl(o.w / 2, o.w / 2, t, top, 36), 0, o.h - t / 2, 0));
        g.add(at(cyl(0.06, 0.08, o.h - t, base), 0, (o.h - t) / 2, 0));
        g.add(at(cyl(o.w * 0.22, o.w * 0.25, 0.03, base), 0, 0.015, 0));
      } else if (o.h < 0.55) {
        g.add(at(rbox(o.w, o.h, o.d, top, 0.02), 0, o.h / 2, 0));
      } else {
        g.add(at(rbox(o.w, t, o.d, top, 0.01), 0, o.h - t / 2, 0));
        legsFor(g, o.w, o.d, o.h - t, base, 0.06);
      }
    },
    cabinet(o, g) {
      const m = material(o.c1, o.material || 'wood');
      const plinth = 0.06;
      g.add(at(rbox(o.w, o.h - plinth, o.d, m, 0.01), 0, plinth + (o.h - plinth) / 2, 0));
      g.add(at(boxm(o.w - 0.06, plinth, o.d - 0.06, material(shade(o.c1, -0.2), 'wood')), 0, plinth / 2, 0));
      const doors = Math.max(1, Math.round(o.w / 0.5));
      const line = material(shade(o.c1, -0.25), 'wood');
      for (let i = 1; i < doors; i++) g.add(at(boxm(0.006, o.h - plinth - 0.06, 0.004, line), -o.w / 2 + (o.w / doors) * i, plinth + (o.h - plinth) / 2, o.d / 2 + 0.002));
      for (let i = 0; i < doors; i++) g.add(at(boxm(0.012, 0.12, 0.02, material(o.c2, 'brass')), -o.w / 2 + (o.w / doors) * (i + 0.5) + 0.08, plinth + (o.h - plinth) * 0.62, o.d / 2 + 0.012));
    },
    bookshelf(o, g) {
      const m = material(o.c1, o.material || 'wood');
      const th = 0.03, shelves = Math.max(2, Math.round(o.h / 0.38));
      [-1, 1].forEach(s => g.add(at(boxm(th, o.h, o.d, m), s * (o.w / 2 - th / 2), o.h / 2, 0)));
      g.add(at(boxm(o.w, o.h, 0.01, m), 0, o.h / 2, -o.d / 2 + 0.005));
      const bookCols = ['#7A0F24', '#D9A13E', '#3F5A4A', '#E6DCCB', '#3B4A63', '#B9A58A'];
      for (let i = 0; i <= shelves; i++) {
        const y = i * (o.h - th) / shelves + th / 2;
        g.add(at(boxm(o.w - 2 * th, th, o.d, m), 0, y, 0));
        if (i === shelves) break;
        let x = -o.w / 2 + th + 0.02;
        while (x < o.w / 2 - th - 0.1 && rand() > 0.08) {
          const bw = 0.025 + rand() * 0.03, bh = 0.18 + rand() * 0.1;
          g.add(at(boxm(bw, bh, o.d * 0.7, material(bookCols[Math.floor(rand() * bookCols.length)], 'paper')), x + bw / 2, y + th / 2 + bh / 2, 0));
          x += bw + 0.004;
          if (rand() > 0.85) x += 0.12;
        }
      }
    },
    bed(o, g) {
      const frame = material(o.c2, o.material || 'wood'), linen = material('#F3EFE8', 'fabric'), duvet = material(o.c1, 'fabric');
      const baseH = 0.3, matH = 0.22;
      g.add(at(rbox(o.w, baseH, o.d, frame, 0.03), 0, baseH / 2, 0));
      g.add(at(rbox(o.w - 0.06, matH, o.d - 0.08, linen, 0.06), 0, baseH + matH / 2, 0.02));
      g.add(at(rbox(o.w - 0.02, 0.06, o.d * 0.66, duvet, 0.03), 0, baseH + matH + 0.02, o.d * 0.17));
      g.add(at(rbox(o.w + 0.04, Math.max(0.9, o.h), 0.1, frame, 0.04), 0, Math.max(0.9, o.h) / 2, -o.d / 2 - 0.03));
      const pillows = o.w > 1.3 ? 2 : 1;
      for (let i = 0; i < pillows; i++) g.add(at(rbox(o.w / pillows - 0.15, 0.13, 0.36, linen, 0.06), -o.w / 2 + (o.w / pillows) * (i + 0.5), baseH + matH + 0.08, -o.d / 2 + 0.3));
    },
    rug(o, g) {
      if (o.shape === 'round') {
        g.add(at(cyl(o.w / 2, o.w / 2, 0.012, material(o.c2, 'fabric'), 48), 0, 0.006, 0));
        g.add(at(cyl(o.w / 2 - 0.1, o.w / 2 - 0.1, 0.014, material(o.c1, 'fabric'), 48), 0, 0.007, 0));
      } else {
        g.add(at(boxm(o.w, 0.012, o.d, material(o.c2, 'fabric')), 0, 0.006, 0));
        g.add(at(boxm(o.w - 0.16, 0.014, o.d - 0.16, material(o.c1, 'fabric')), 0, 0.007, 0));
      }
      g.traverse(m => { m.castShadow = false; });
    },
    plant(o, g) {
      const pot = material(o.c2 === '#6B5B4B' ? '#D8CFC2' : o.c2, 'ceramic');
      const potH = Math.min(0.45, o.h * 0.3), r = Math.min(o.w, 0.5) / 2;
      g.add(at(cyl(r, r * 0.8, potH, pot), 0, potH / 2, 0));
      const leaf = new THREE.MeshStandardMaterial({ color: color(o.c1, '#5F7D4E') === '#C9B9A6' ? '#5F7D4E' : o.c1, roughness: 0.8, flatShading: true });
      const crown = Math.max(0.3, o.h - potH);
      for (let i = 0; i < 7; i++) {
        const s = r * (0.7 + rand() * 0.6);
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), leaf);
        m.position.set((rand() - 0.5) * r * 1.6, potH + crown * (0.35 + rand() * 0.6), (rand() - 0.5) * r * 1.6);
        m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
        g.add(m);
      }
    },
    floor_lamp(o, g) {
      const metal = material(o.c2, 'metal');
      const h = Math.max(1.2, o.h);
      g.add(at(cyl(0.14, 0.15, 0.03, metal), 0, 0.015, 0));
      g.add(at(cyl(0.012, 0.012, h - 0.3, metal, 8), 0, (h - 0.3) / 2, 0));
      const shadeM = new THREE.MeshStandardMaterial({ color: o.c1, emissive: '#FFD9A0', emissiveIntensity: evening ? 0.9 : 0.35, roughness: 0.9, side: THREE.DoubleSide });
      g.add(at(cyl(0.16, 0.22, 0.3, shadeM, 24), 0, h - 0.15, 0));
      g.userData.light = [0, h - 0.2, 0, 1];
    },
    table_lamp(o, g) {
      const base = material(o.c2, o.material || 'ceramic');
      const h = Math.max(0.35, Math.min(0.8, o.h));
      g.add(at(cyl(0.07, 0.09, h * 0.55, base), 0, h * 0.275, 0));
      const shadeM = new THREE.MeshStandardMaterial({ color: o.c1, emissive: '#FFD9A0', emissiveIntensity: evening ? 0.9 : 0.35, roughness: 0.9, side: THREE.DoubleSide });
      g.add(at(cyl(0.11, 0.16, h * 0.4, shadeM, 24), 0, h * 0.75, 0));
      g.userData.light = [0, h * 0.7, 0, 0.6];
    },
    pendant_light(o, g) {
      // y is the height of the shade above the floor; without it, hang the shade 80 cm below the ceiling
      const y0 = o.y > 1.2 ? Math.min(o.y, H - 0.25) : H - 0.8;
      g.add(at(cyl(0.006, 0.006, H - y0, material('#222222', 'metal'), 6), 0, (H + y0) / 2, 0));
      const shadeM = new THREE.MeshStandardMaterial({ color: o.c1, emissive: '#FFD9A0', emissiveIntensity: evening ? 1 : 0.4, roughness: 0.6, metalness: /metal|brass/.test(o.material) ? 0.6 : 0, side: THREE.DoubleSide });
      const r = Math.max(0.15, o.w / 2);
      const sh = o.type === 'chandelier' ? new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), shadeM) : cyl(r * 0.35, r, r * 0.8, shadeM, 28);
      g.add(at(sh, 0, y0, 0));
      g.userData.light = [0, y0 - 0.1, 0, 1.3];
      g.userData.noFloor = true;
    },
    ottoman(o, g) {
      const m = material(o.c1, o.material || 'fabric');
      if (o.shape === 'round') g.add(at(cyl(o.w / 2, o.w / 2, o.h, m, 28), 0, o.h / 2, 0));
      else g.add(at(rbox(o.w, o.h, o.d, m, 0.05), 0, o.h / 2, 0));
    },
    fireplace(o, g) {
      const m = material(o.c1, o.material || 'stone');
      g.add(at(rbox(o.w, o.h, o.d, m, 0.01), 0, o.h / 2, 0));
      g.add(at(boxm(o.w * 0.55, o.h * 0.45, 0.02, new THREE.MeshStandardMaterial({ color: '#1C1714', emissive: '#FF8A3D', emissiveIntensity: 0.25 })), 0, o.h * 0.3, o.d / 2 + 0.005));
      g.add(at(boxm(o.w + 0.1, 0.05, o.d + 0.06, material(o.c2, 'wood')), 0, o.h + 0.025, 0));
    },
    counter(o, g) {
      const body = material(o.c1, o.material || 'wood');
      g.add(at(boxm(o.w, o.h - 0.04, o.d, body), 0, (o.h - 0.04) / 2, 0));
      g.add(at(boxm(o.w + 0.03, 0.04, o.d + 0.03, material(o.c2, 'stone')), 0, o.h - 0.02, 0));
    },
    decor(o, g) {
      const m = material(o.c1, o.material || 'ceramic');
      g.add(at(cyl(o.w * 0.3, o.w * 0.45, o.h, m, 18), 0, o.h / 2, 0));
    },
    box(o, g) {
      g.add(at(rbox(o.w, o.h, o.d, material(o.c1, o.material), 0.03), 0, o.h / 2, 0));
    },
    // Wall-mounted pieces: local x along the wall, local +z into the room
    artwork(o, g) {
      const frameM = material(o.c2, 'wood');
      const tex = canvasTexture(256, (c, s) => {
        c.fillStyle = o.c1; c.fillRect(0, 0, s, s);
        for (let i = 0; i < 5; i++) {
          c.fillStyle = ['#ffffff55', '#00000022', o.c2 + '88', '#D9A13E66', '#7A0F2455'][i];
          c.beginPath(); c.arc(rand() * s, rand() * s, 30 + rand() * 80, 0, Math.PI * 2); c.fill();
        }
      });
      g.add(at(boxm(o.w, o.h, 0.03, frameM), 0, o.h / 2, 0.015));
      g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(o.w - 0.06, o.h - 0.06), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })), 0, o.h / 2, 0.032));
    },
    mirror(o, g) {
      g.add(at(boxm(o.w, o.h, 0.03, material(o.c2, 'brass')), 0, o.h / 2, 0.015));
      g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(o.w - 0.05, o.h - 0.05), new THREE.MeshStandardMaterial({ color: '#C9D3D8', metalness: 1, roughness: 0.08 })), 0, o.h / 2, 0.031));
    },
    tv(o, g) {
      g.add(at(boxm(o.w, o.h, 0.04, new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.25, metalness: 0.3 })), 0, o.h / 2, 0.02));
    },
    curtains(o, g) {
      const m = material(o.c1, 'fabric');
      const h = Math.min(H - 0.05, Math.max(1.6, o.h));
      const folds = Math.max(4, Math.round(o.w / 0.12));
      for (let i = 0; i < folds; i++) g.add(at(cyl(0.05, 0.06, h, m, 8), -o.w / 2 + (o.w / folds) * (i + 0.5), h / 2, 0.08));
      const rod = at(cyl(0.012, 0.012, o.w + 0.2, material('#2B2B2B', 'metal'), 8), 0, h + 0.02, 0.08);
      rod.rotation.z = Math.PI / 2;
      g.add(rod);
    },
    shelf(o, g) {
      g.add(at(boxm(o.w, 0.035, Math.max(0.2, o.d), material(o.c1, 'wood')), 0, 0.0175, Math.max(0.2, o.d) / 2));
    },
    wall_light(o, g) {
      g.add(at(cyl(0.06, 0.08, 0.16, new THREE.MeshStandardMaterial({ color: o.c1, emissive: '#FFD9A0', emissiveIntensity: evening ? 1 : 0.4 }), 16), 0, 0.08, 0.08));
      g.userData.light = [0, 0.1, 0.2, 0.5];
    }
  };
  const ALIAS = {
    sectional: 'sofa', couch: 'sofa', loveseat: 'sofa', daybed: 'sofa', bench: 'ottoman', pouf: 'ottoman',
    accent_chair: 'armchair', lounge_chair: 'armchair', dining_chair: 'chair', office_chair: 'chair', bar_stool: 'stool',
    coffee_table: 'table', side_table: 'table', end_table: 'table', dining_table: 'table', desk: 'table', console: 'table', console_table: 'table',
    nightstand: 'cabinet', sideboard: 'cabinet', dresser: 'cabinet', wardrobe: 'cabinet', tv_unit: 'cabinet', media_console: 'cabinet', credenza: 'cabinet', cupboard: 'cabinet',
    bookcase: 'bookshelf', shelving: 'bookshelf', kitchen_counter: 'counter', island: 'counter', kitchen_island: 'counter', bar: 'counter',
    chandelier: 'pendant_light', pendant: 'pendant_light', ceiling_light: 'pendant_light', lamp: 'table_lamp', sconce: 'wall_light',
    vase: 'decor', sculpture: 'decor', planter: 'plant', tree: 'plant', painting: 'artwork', art: 'artwork', picture: 'artwork', television: 'tv', drapes: 'curtains'
  };

  const wallPose = (o) => {
    const L = wallLen(o.wall), along = o.offset + o.w / 2;
    if (o.wall === 'back') return [-W / 2 + along, -D / 2, 0];
    if (o.wall === 'left') return [-W / 2, D / 2 - along, Math.PI / 2];
    if (o.wall === 'right') return [W / 2, -D / 2 + along, -Math.PI / 2];
    return [W / 2 - along, D / 2, Math.PI];
  };

  const followers = [];
  spec.objects.forEach(o => {
    const kind = B[o.type] ? o.type : ALIAS[o.type] || 'box';
    const g = new THREE.Group();
    B[kind]({ ...o, type: o.type }, g);
    g.traverse(m => { if (m.isMesh && m.castShadow !== false && kind !== 'rug') { m.castShadow = !mobile; m.receiveShadow = true; } });
    if (o.wall) {
      const [x, z, ry] = wallPose(o);
      g.position.set(x, o.y, z);
      g.rotation.y = ry;
      // Wall pieces live in the wall's group so they hide with it
      const wg = wallGroups[o.wall];
      wg.updateMatrixWorld();
      const inv = new THREE.Matrix4().copy(wg.matrixWorld).invert();
      g.updateMatrix();
      g.applyMatrix4(inv);
      wg.add(g);
    } else {
      g.position.set(o.x, g.userData.noFloor ? 0 : o.y, o.z);
      g.rotation.y = o.rot;
      scene.add(g);
      // Tall pieces standing against a wall hide with it, so they never block the dollhouse view
      if (o.h > 1.1 && !g.userData.noFloor) {
        const gap = { back: o.z + D / 2, front: D / 2 - o.z, left: o.x + W / 2, right: W / 2 - o.x };
        const near = WALLS.reduce((a, b) => (gap[a] < gap[b] ? a : b));
        if (gap[near] < 0.7) followers.push([g, near]);
      }
    }
    if (g.userData.light) {
      g.updateMatrixWorld(true);
      const [lx, ly, lz, s] = g.userData.light;
      const p = new THREE.Vector3(lx, ly, lz).applyMatrix4(g.matrixWorld);
      lamp(p.x, p.y, p.z, s);
    }
  });

  // ---------- Camera, controls, dollhouse walls ----------
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 0.6;
  controls.maxDistance = Math.max(W, D) * 3;
  const home = () => {
    camera.position.set(W * 0.12, H * 1.35, D / 2 + Math.max(W, D) * 0.95);
    controls.target.set(0, H * 0.32, -D * 0.05);
    controls.update();
  };
  home();

  const pos = new THREE.Vector3();
  const updateWalls = () => {
    pos.copy(camera.position);
    wallGroups.back.visible = pos.z > -D / 2;
    wallGroups.front.visible = pos.z < D / 2;
    wallGroups.left.visible = pos.x > -W / 2;
    wallGroups.right.visible = pos.x < W / 2;
    ceiling.visible = pos.y < H && pos.x > -W / 2 && pos.x < W / 2 && pos.z > -D / 2 && pos.z < D / 2;
    followers.forEach(([g, w]) => { g.visible = wallGroups[w].visible; });
  };

  let dirty = true;
  controls.addEventListener('change', () => { dirty = true; });
  const resize = () => {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  renderer.setAnimationLoop(() => {
    controls.update();
    if (!dirty) return;
    dirty = false;
    updateWalls();
    renderer.render(scene, camera);
  });

  return {
    resetView() { home(); dirty = true; },
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls.dispose();
      scene.traverse(m => {
        if (m.geometry) m.geometry.dispose();
        if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => { if (x.map) x.map.dispose(); x.dispose(); });
      });
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
