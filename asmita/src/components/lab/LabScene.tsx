"use client";

import { useEffect, useRef, useState } from "react";
import type * as ThreeNS from "three";

/*
 * Decorative Three.js scenes for the AI Lab hub. Every scene is abstract —
 * coloured tiles, light, networks — and never shows a real image or a
 * person. Each <LabScene> is an empty, aria-hidden box; the text beside it
 * says what the tool does.
 *
 * All scenes share one hidden WebGL renderer (see "the stage" below).
 * Three.js loads when the first box comes near the screen, never under
 * prefers-reduced-motion or without WebGL; the box then keeps its still
 * CSS gradient instead.
 */

/** "light": the gradient page (the default); "night": the dark page. */
export type LabTone = "light" | "night";

export type LabSceneKind =
  | "hero"
  | "trace"
  | "tracker"
  | "detectors"
  | "protect"
  | "message-check"
  | "stamp"
  | "spot-the-fake"
  | "open-tools"
  | "stacks";

type Three = typeof ThreeNS;
type Pointer = { x: number; y: number };
type Built = { update: (t: number, dt: number, pointer: Pointer) => void; dispose?: () => void };
type Builder = (THREE: Three, scene: ThreeNS.Scene, camera: ThreeNS.PerspectiveCamera) => Built;

// The tone of the scene being built. Builders run synchronously inside
// addEntry, which sets this first; the helpers below read it.
let TONE: LabTone = "light";
const night = () => TONE === "night";
/** Glow adds light on the dark page; on the light page it would wash out to white. */
const blendMode = (THREE: Three) => (night() ? THREE.AdditiveBlending : THREE.NormalBlending);
/** Lines and wireframes that were white on the dark page are deep ink on the light one. */
const fg = () => (night() ? 0xffffff : 0x2a2160);

// The Lab palette: teal, coral, violet, amber, sky, pink.
export const LAB_COLORS = [0x19d3c5, 0xff7a59, 0x8b6cff, 0xffc23d, 0x38b6ff, 0xff4f9a];
const [TEAL, CORAL, VIOLET, AMBER, SKY, PINK] = LAB_COLORS;

const BUILDERS: Record<LabSceneKind, Builder> = {
  hero: buildHero,
  trace: buildTrace,
  tracker: buildTracker,
  detectors: buildDetectors,
  protect: buildProtect,
  "message-check": buildMessageCheck,
  stamp: buildStamp,
  "spot-the-fake": buildSpotTheFake,
  "open-tools": buildOpenTools,
  stacks: buildStacks,
};

/* ------------------------------ the stage ------------------------------ */

/*
 * One hidden WebGL renderer draws every scene (browsers cap live WebGL
 * contexts, and phones suffer with many). Each <LabScene> box holds an
 * ordinary 2D canvas in the page flow, so a scene scrolls with its card
 * exactly, with no lag. Each frame, for every box on screen only, the
 * renderer draws the scene into its corner and the box's canvas copies it.
 * Box sizes come from a ResizeObserver and visibility from an
 * IntersectionObserver, so the loop never measures the page.
 *
 * Quality adapts to the device: phones and touch screens render at up to
 * 1.5x pixels and 30 frames a second; laptops at up to 2x and the display
 * rate. When no box is on screen the loop stops entirely.
 */

type Entry = {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  scene: ThreeNS.Scene;
  camera: ThreeNS.PerspectiveCamera;
  built: Built;
  t: number;
  pointer: Pointer;
  target: Pointer;
  width: number;
  height: number;
  visible: boolean;
  resize: ResizeObserver;
  onMove: (event: PointerEvent) => void;
  onLeave: () => void;
};

type Stage = {
  THREE: Three;
  renderer: ThreeNS.WebGLRenderer;
  entries: Set<Entry>;
  io: IntersectionObserver;
  wake: () => void;
  stop: () => void;
};

let stage: Stage | null = null;
let starting: Promise<Stage> | null = null;

function canAnimate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const probe = document.createElement("canvas");
  const context = probe.getContext("webgl2") || probe.getContext("webgl");
  if (!context) return false;
  // Release the probe's context at once: browsers cap live WebGL contexts.
  context.getExtension("WEBGL_lose_context")?.loseContext();
  return true;
}

/** Phones and tablets: fewer pixels, fewer frames. */
function isLowPower() {
  return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
}

async function ensureStage(): Promise<Stage> {
  if (stage) return stage;
  if (starting) return starting;
  starting = (async () => {
    const THREE = await import("three");
    const lowPower = isLowPower();
    const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2);
    const renderer = new THREE.WebGLRenderer({
      antialias: !lowPower || dpr < 1.5,
      alpha: true,
      powerPreference: lowPower ? "low-power" : "high-performance",
    });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    // The renderer's canvas grows to the largest box drawn so far (in device
    // pixels) and is never shown: each box's own canvas copies from it.
    let bufferW = 1;
    let bufferH = 1;
    const ensureBuffer = (w: number, h: number) => {
      if (w <= bufferW && h <= bufferH) return;
      bufferW = Math.max(bufferW, w);
      bufferH = Math.max(bufferH, h);
      renderer.setSize(bufferW, bufferH, false);
    };

    const entries = new Set<Entry>();
    const io = new IntersectionObserver((hits) => {
      for (const hit of hits) {
        for (const entry of entries) if (entry.el === hit.target) entry.visible = hit.isIntersecting;
      }
      wake();
    });

    const frameGap = lowPower ? 1 / 30 : 0;
    const clock = new THREE.Clock();
    let raf = 0;
    let running = false;
    let since = 0;

    const draw = (dt: number) => {
      for (const entry of entries) {
        if (!entry.visible || entry.width < 2 || entry.height < 2) continue;
        const w = Math.round(entry.width * dpr);
        const h = Math.round(entry.height * dpr);
        ensureBuffer(w, h);
        if (entry.canvas.width !== w || entry.canvas.height !== h) {
          entry.canvas.width = w;
          entry.canvas.height = h;
        }
        entry.pointer.x += (entry.target.x - entry.pointer.x) * 0.1;
        entry.pointer.y += (entry.target.y - entry.pointer.y) * 0.1;
        entry.t += dt;
        entry.built.update(entry.t, dt, entry.pointer);
        // Draw in the bottom-left corner of the buffer (GL's origin), then
        // copy that corner; the canvas's top-left is the buffer's top-left.
        renderer.setScissorTest(true);
        renderer.setViewport(0, 0, w, h);
        renderer.setScissor(0, 0, w, h);
        renderer.clear();
        renderer.render(entry.scene, entry.camera);
        entry.ctx.clearRect(0, 0, w, h);
        entry.ctx.drawImage(renderer.domElement, 0, bufferH - h, w, h, 0, 0, w, h);
      }
    };

    const loop = () => {
      const anyVisible = [...entries].some((entry) => entry.visible);
      if (!anyVisible || document.hidden) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(loop);
      since += Math.min(clock.getDelta(), 0.1);
      if (since < frameGap) return;
      const dt = Math.min(since, 1 / 20);
      since = 0;
      draw(dt);
    };
    const wake = () => {
      if (running) return;
      running = true;
      clock.getDelta();
      since = 0;
      raf = requestAnimationFrame(loop);
    };
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const stop = () => {
      cancelAnimationFrame(raf);
      running = false;
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.dispose();
      renderer.forceContextLoss();
    };
    stage = { THREE, renderer, entries, io, wake, stop };
    return stage;
  })();
  try {
    return await starting;
  } finally {
    starting = null;
  }
}

/*
 * Building a scene and compiling its shaders is the one costly step, and
 * doing it mid-scroll is what makes a page stutter. So scenes are built one
 * at a time, in idle moments, well before they reach the screen, and their
 * shaders are compiled in the background before they first draw.
 */
const buildQueue: (() => Promise<void>)[] = [];
let building = false;
function enqueueBuild(task: () => Promise<void>) {
  buildQueue.push(task);
  if (!building) void drainBuilds();
}
async function drainBuilds() {
  building = true;
  while (buildQueue.length) {
    await new Promise<void>((resolve) => {
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle(() => resolve(), { timeout: 400 });
      else setTimeout(resolve, 30);
    });
    const task = buildQueue.shift();
    if (task) await task().catch(() => undefined);
  }
  building = false;
}

async function addEntry(s: Stage, el: HTMLElement, kind: LabSceneKind, tone: LabTone): Promise<Entry | null> {
  const canvas = document.createElement("canvas");
  canvas.className = "lab-scene-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  el.appendChild(canvas);

  TONE = tone;
  const scene = new s.THREE.Scene();
  const camera = new s.THREE.PerspectiveCamera(35, 1, 0.1, 100);
  const built = BUILDERS[kind](s.THREE, scene, camera);

  const setSize = (width: number, height: number) => {
    entry.width = width;
    entry.height = height;
    if (width > 0 && height > 0) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  };
  // The pointer leans a scene only with a mouse; touch scrolling never does.
  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    entry.target.x = ((event.clientX - r.left) / r.width) * 2 - 1;
    entry.target.y = -(((event.clientY - r.top) / r.height) * 2 - 1);
  };
  const onLeave = () => {
    entry.target.x = 0;
    entry.target.y = 0;
  };
  const hoverArea = el.closest<HTMLElement>(".lab-card") ?? el;
  hoverArea.addEventListener("pointermove", onMove, { passive: true });
  hoverArea.addEventListener("pointerleave", onLeave);

  const resize = new ResizeObserver(([box]) => setSize(box.contentRect.width, box.contentRect.height));
  const entry: Entry = {
    el,
    canvas,
    ctx,
    scene,
    camera,
    built,
    t: 0,
    pointer: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    width: 0,
    height: 0,
    visible: false,
    resize,
    onMove,
    onLeave,
  };
  const r = el.getBoundingClientRect();
  setSize(r.width, r.height);
  // Compile this scene's shaders off the main thread where the browser can.
  await s.renderer.compileAsync(scene, camera).catch(() => undefined);
  resize.observe(el);
  s.entries.add(entry);
  s.io.observe(el);
  return entry;
}

function removeEntry(entry: Entry) {
  const s = stage;
  if (!s) return;
  s.entries.delete(entry);
  s.io.unobserve(entry.el);
  entry.resize.disconnect();
  const hoverArea = entry.el.closest<HTMLElement>(".lab-card") ?? entry.el;
  hoverArea.removeEventListener("pointermove", entry.onMove);
  hoverArea.removeEventListener("pointerleave", entry.onLeave);
  entry.canvas.remove();
  entry.built.dispose?.();
  entry.scene.traverse((object) => {
    const mesh = object as ThreeNS.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as ThreeNS.Material | ThreeNS.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose?.();
  });
  if (s.entries.size === 0) {
    s.stop();
    stage = null;
    glowCache = null;
  }
}

export function LabScene({ kind, tone = "light", className = "" }: { kind: LabSceneKind; tone?: LabTone; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el || !canAnimate()) return;
    let cancelled = false;
    let entry: Entry | null = null;
    const near = new IntersectionObserver(
      ([hit]) => {
        if (!hit.isIntersecting) return;
        near.disconnect();
        ensureStage()
          .then((s) =>
            enqueueBuild(async () => {
              if (cancelled) return;
              const added = await addEntry(s, el, kind, tone);
              if (!added) return;
              if (cancelled) {
                removeEntry(added);
                return;
              }
              entry = added;
              setLive(true);
            }),
          )
          .catch(() => undefined);
      },
      { rootMargin: "900px 0px" },
    );
    near.observe(el);
    return () => {
      cancelled = true;
      near.disconnect();
      if (entry) removeEntry(entry);
    };
  }, [kind, tone]);

  return <div ref={host} className={`lab-scene lab-scene-${kind} ${live ? "is-live" : ""} ${className}`} aria-hidden="true" />;
}

/* ------------------------------- helpers ------------------------------- */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => {
  const k = clamp01(x);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

function roundedShape(THREE: Three, w: number, h: number, r: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return shape;
}

function roundedTile(THREE: Three, w: number, h: number, r: number, depth: number) {
  const geometry = new THREE.ExtrudeGeometry(roundedShape(THREE, w, h, r), { depth, bevelEnabled: false, curveSegments: 6 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function roundedOutline(THREE: Three, w: number, h: number, r: number) {
  const points = roundedShape(THREE, w, h, r).getPoints(10);
  return new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, p.y, 0)));
}

/** A small canvas texture: a soft gradient "picture" made of blobs, no real image. */
function blobTexture(THREE: Three, seed: number) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const pick = (i: number) => hex(LAB_COLORS[(seed + i) % LAB_COLORS.length]);
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, pick(0));
  g.addColorStop(1, pick(2));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5; i += 1) {
    const x = ((seed * 37 + i * 53) % 100) / 100;
    const y = ((seed * 71 + i * 29) % 100) / 100;
    const radial = ctx.createRadialGradient(x * size, y * size, 0, x * size, y * size, size * 0.45);
    radial.addColorStop(0, `${pick(i + 1)}cc`);
    radial.addColorStop(1, `${pick(i + 1)}00`);
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

let glowCache: ThreeNS.Texture | null = null;
/** A soft round glow, shared by every scene's sprites and points. */
function glowTexture(THREE: Three) {
  if (glowCache) return glowCache;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const radial = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  radial.addColorStop(0, "rgba(255,255,255,1)");
  radial.addColorStop(0.25, "rgba(255,255,255,0.55)");
  radial.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, size, size);
  glowCache = new THREE.CanvasTexture(canvas);
  return glowCache;
}

function glow(THREE: Three, color: number, size: number, opacity = 0.9) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(THREE), color, transparent: true, opacity, blending: blendMode(THREE), depthWrite: false }),
  );
  sprite.scale.setScalar(size);
  return sprite;
}

/** A drifting field of coloured dust, behind the main objects. */
function dust(THREE: Three, count: number, spread: [number, number, number], size = 0.08) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * spread[0];
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread[1];
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread[2] - spread[2] / 2;
    color.setHex(LAB_COLORS[i % LAB_COLORS.length]);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size,
      map: glowTexture(THREE),
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: blendMode(THREE),
      depthWrite: false,
    }),
  );
}

/**
 * Pull the camera back on narrow boxes so content `width` units wide still
 * fits; never closer than `baseZ`. Scenes call this each frame, so a scene
 * fits a wide hub card and a squarer hero panel alike.
 */
function fitWidth(camera: ThreeNS.PerspectiveCamera, baseZ: number, width: number) {
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
  const z = Math.max(baseZ, width / (2 * tanHalf * camera.aspect));
  if (Math.abs(camera.position.z - z) > 1e-3) camera.position.setZ(z);
}

function lean(object: ThreeNS.Object3D, pointer: Pointer, amount = 0.25) {
  object.rotation.y += (pointer.x * amount - object.rotation.y) * 0.08;
  object.rotation.x += (-pointer.y * amount * 0.7 - object.rotation.x) * 0.08;
}

/* -------------------------------- hero -------------------------------- */

/* A floating grid of colourful "pictures". Now and then one cracks into four
 * shards that drift apart and shift colour (a morph), then snap back to where
 * they came from (traced to the source). The grid leans toward the pointer. */
function buildHero(THREE: Three, scene: ThreeNS.Scene, camera: ThreeNS.PerspectiveCamera): Built {
  // Phones show only the middle of the grid anyway: build just that much.
  const COLS = isLowPower() ? 7 : 13;
  const ROWS = 5;
  const SIZE = 1.25;
  const GAP = 0.32;
  const group = new THREE.Group();
  scene.add(group);
  const field = dust(THREE, isLowPower() ? 90 : 260, [30, 12, 8], 0.12);
  scene.add(field);

  const tileGeo = roundedTile(THREE, SIZE, SIZE, 0.16, 0.12);
  const shardGeo = roundedTile(THREE, SIZE / 2 - 0.03, SIZE / 2 - 0.03, 0.08, 0.12);
  const edgeGeo = roundedOutline(THREE, SIZE + 0.08, SIZE + 0.08, 0.2);
  const textures = Array.from({ length: 8 }, (_, i) => blobTexture(THREE, i));
  // One material per picture, shared by every tile that shows it.
  const tileMaterials = textures.map((map) => new THREE.MeshBasicMaterial({ map }));

  type Tile = { mesh: ThreeNS.Mesh; edge: ThreeNS.Line; home: ThreeNS.Vector3; phase: number; shards: ThreeNS.Mesh[]; crackAt: number };
  const tiles: Tile[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const i = r * COLS + c;
      const mesh = new THREE.Mesh(tileGeo, tileMaterials[i % tileMaterials.length]);
      const home = new THREE.Vector3((c - (COLS - 1) / 2) * (SIZE + GAP), (r - (ROWS - 1) / 2) * (SIZE + GAP), 0);
      mesh.position.copy(home);
      group.add(mesh);
      const edge = new THREE.Line(
        edgeGeo,
        new THREE.LineBasicMaterial({ color: LAB_COLORS[i % LAB_COLORS.length], transparent: true, opacity: 0, blending: blendMode(THREE) }),
      );
      group.add(edge);
      const shards: ThreeNS.Mesh[] = [];
      for (let s = 0; s < 4; s += 1) {
        const shard = new THREE.Mesh(shardGeo, new THREE.MeshBasicMaterial({ color: LAB_COLORS[(i + s) % LAB_COLORS.length] }));
        shard.visible = false;
        group.add(shard);
        shards.push(shard);
      }
      tiles.push({ mesh, edge, home, phase: (c * 0.6 + r * 0.9) % (Math.PI * 2), shards, crackAt: -99 });
    }
  }

  const CRACK = 3.2;
  let nextCrack = 0.8;
  const offsets = [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ];

  return {
    update(t, _dt, pointer) {
      // Fit the grid to the box: the full width on wide screens, the full
      // height (cropping the sides) on narrow ones.
      const gridW = COLS * (SIZE + GAP);
      const gridH = ROWS * (SIZE + GAP) + 1.2;
      const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
      camera.position.z = Math.min(gridW / (2 * tanHalf * camera.aspect), Math.max(gridH / (2 * tanHalf), 9)) * 0.98;
      lean(group, pointer, 0.3);
      field.rotation.z = t * 0.01;
      field.position.x = Math.sin(t * 0.1) * 0.6;

      if (t > nextCrack) {
        const idle = tiles.filter((tile) => t - tile.crackAt > CRACK);
        const pick = idle[Math.floor(Math.random() * idle.length)];
        if (pick) pick.crackAt = t;
        nextCrack = t + 0.6 + Math.random() * 0.5;
      }

      for (const tile of tiles) {
        const wave = Math.sin(t * 1.1 + tile.phase);
        tile.mesh.position.set(tile.home.x, tile.home.y + wave * 0.08, tile.home.z + wave * 0.35);
        tile.mesh.rotation.set(wave * 0.06, Math.cos(t * 0.9 + tile.phase) * 0.08, 0);
        tile.edge.position.copy(tile.mesh.position);
        tile.edge.rotation.copy(tile.mesh.rotation);

        const k = (t - tile.crackAt) / CRACK;
        const cracking = k >= 0 && k < 1;
        tile.mesh.visible = !cracking;
        tile.edge.visible = cracking;
        if (cracking) (tile.edge.material as ThreeNS.LineBasicMaterial).opacity = 0.9 * Math.sin(k * Math.PI);
        tile.shards.forEach((shard, s) => {
          shard.visible = cracking;
          if (!cracking) return;
          // 0–0.45 drift apart, 0.45–0.6 hold, 0.6–1 snap home.
          const out = k < 0.45 ? ease(k / 0.45) : k < 0.6 ? 1 : 1 - ease((k - 0.6) / 0.4);
          const [ox, oy] = offsets[s];
          const quarter = SIZE / 4;
          shard.position.set(
            tile.mesh.position.x + ox * quarter + ox * out * 0.9,
            tile.mesh.position.y + oy * quarter + oy * out * 0.9,
            tile.mesh.position.z + out * 1.6,
          );
          shard.rotation.set(out * oy * 0.9, out * ox * 0.9, out * (s % 2 ? 1 : -1) * 0.8);
          (shard.material as ThreeNS.MeshBasicMaterial).color.setHex(LAB_COLORS[(s + Math.floor(t * 2.5)) % LAB_COLORS.length]);
        });
      }
    },
    dispose() {
      textures.forEach((texture) => texture.dispose());
    },
  };
}

/* -------------------------------- trace -------------------------------- */

/* A source picture and a cropped, tilted copy. Matching points light up on
 * both, threads draw between them, and the copy flies back and docks on the
 * spot it was cut from. */
function buildTrace(THREE: Three, scene: ThreeNS.Scene, camera: ThreeNS.PerspectiveCamera): Built {
  camera.position.set(0, 0, 7.2);
  const root = new THREE.Group();
  scene.add(root);
  const texture = blobTexture(THREE, 3);
  const SIZE = 2.6;
  const source = new THREE.Mesh(roundedTile(THREE, SIZE, SIZE, 0.18, 0.08), new THREE.MeshBasicMaterial({ map: texture }));
  source.position.set(-2.1, 0, 0);
  root.add(source);
  const halo = glow(THREE, VIOLET, 5, 0.35);
  halo.position.set(-2.1, 0, -0.5);
  root.add(halo);

  // The copy shows only the top-right quarter of the same picture, enlarged.
  const copyTexture = texture.clone();
  copyTexture.repeat.set(0.5, 0.5);
  copyTexture.offset.set(0.5, 0.5);
  copyTexture.needsUpdate = true;
  const copy = new THREE.Mesh(roundedTile(THREE, SIZE * 0.82, SIZE * 0.82, 0.18, 0.08), new THREE.MeshBasicMaterial({ map: copyTexture }));
  copy.position.set(2.2, 0, 0);
  root.add(copy);

  const frame = new THREE.Line(roundedOutline(THREE, SIZE / 2, SIZE / 2, 0.08), new THREE.LineBasicMaterial({ color: fg(), transparent: true, opacity: 0 }));
  frame.position.set(source.position.x + SIZE / 4, SIZE / 4, 0.1);
  root.add(frame);

  const points = [
    [0.2, 0.3],
    [0.7, 0.2],
    [0.5, 0.6],
    [0.8, 0.8],
    [0.3, 0.85],
  ];
  const threads: { line: ThreeNS.Line; a: ThreeNS.Vector3; b: ThreeNS.Vector3; dots: ThreeNS.Sprite[] }[] = [];
  points.forEach(([u, v], i) => {
    const color = LAB_COLORS[(i + 1) % LAB_COLORS.length];
    const a = new THREE.Vector3(source.position.x + u * 0.5 * SIZE, v * 0.5 * SIZE, 0.12);
    const cs = SIZE * 0.82;
    const b = new THREE.Vector3(copy.position.x - cs / 2 + u * cs, -cs / 2 + v * cs, 0.12);
    const dots = [a, b].map((p) => {
      const dot = glow(THREE, color, 0.5, 0);
      dot.position.copy(p);
      root.add(dot);
      return dot;
    });
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a.clone(), a.clone()]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: blendMode(THREE) }),
    );
    root.add(line);
    threads.push({ line, a, b, dots });
  });

  const LOOP = 7;
  const copyHome = copy.position.clone();
  const dock = new THREE.Vector3(source.position.x + SIZE / 4, SIZE / 4, 0.3);

  return {
    update(t, _dt, pointer) {
      fitWidth(camera, 7.2, 8.6);
      lean(root, pointer, 0.25);
      const k = (t % LOOP) / LOOP;
      const tilt = ease(k / 0.15);
      threads.forEach((thread, i) => {
        const start = 0.15 + i * 0.05;
        const draw = ease((k - start) / 0.12);
        const fade = 1 - ease((k - 0.5) / 0.1);
        thread.dots.forEach((dot) => (dot.material.opacity = ease((k - start) / 0.04) * fade));
        const end = thread.b.clone().lerp(thread.a, 1 - draw);
        const positions = thread.line.geometry.attributes.position as ThreeNS.BufferAttribute;
        positions.setXYZ(0, thread.a.x, thread.a.y, thread.a.z);
        positions.setXYZ(1, end.x, end.y, end.z);
        positions.needsUpdate = true;
        (thread.line.material as ThreeNS.LineBasicMaterial).opacity = 0.9 * fade;
      });
      const fly = ease((k - 0.5) / 0.25);
      const back = ease((k - 0.88) / 0.1);
      const scale = 1 - fly * (1 - 0.5 / 0.82);
      copy.position.lerpVectors(copyHome, dock, fly * (1 - back));
      copy.scale.setScalar(scale + (1 - scale) * back);
      copy.rotation.z = -0.18 * tilt * (1 - fly);
      (frame.material as ThreeNS.LineBasicMaterial).opacity = ease((k - 0.7) / 0.08) * (1 - back);
      halo.material.opacity = 0.25 + 0.35 * ease((k - 0.7) / 0.1) * (1 - back);
    },
    dispose() {
      texture.dispose();
      copyTexture.dispose();
    },
  };
}

/* ------------------------------- tracker ------------------------------- */

/* A slowly turning globe of services linked to each other. One by one, nodes
 * flash and go dark (taken down); the network then lights up again. */
function buildTracker(THREE: Three, scene: ThreeNS.Scene, camera: ThreeNS.PerspectiveCamera): Built {
  camera.position.set(0, 0, 8.4);
  const globe = new THREE.Group();
  scene.add(globe);
  const N = 40;
  const R = 2.4;
  const nodes: { mesh: ThreeNS.Mesh; halo: ThreeNS.Sprite; color: number }[] = [];
  const positions: ThreeNS.Vector3[] = [];
  const nodeGeo = new THREE.SphereGeometry(0.1, 16, 12);
  for (let i = 0; i < N; i += 1) {
    const y = 1 - (i / (N - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = i * 2.399963;
    const p = new THREE.Vector3(Math.cos(theta) * radius * R, y * R, Math.sin(theta) * radius * R);
    positions.push(p);
    const color = LAB_COLORS[i % LAB_COLORS.length];
    const mesh = new THREE.Mesh(nodeGeo, new THREE.MeshBasicMaterial({ color }));
    mesh.position.copy(p);
    globe.add(mesh);
    const halo = glow(THREE, color, 0.7, 0.8);
    halo.position.copy(p);
    globe.add(halo);
    nodes.push({ mesh, halo, color });
  }
  const linkPoints: ThreeNS.Vector3[] = [];
  positions.forEach((p, i) => {
    positions
      .map((q, j) => ({ j, d: p.distanceTo(q) }))
      .filter((e) => e.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .forEach(({ j }) => linkPoints.push(p, positions[j]));
  });
  const links = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(linkPoints),
    new THREE.LineBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.5, blending: blendMode(THREE) }),
  );
  globe.add(links);
  const rings = [SKY, PINK].map((color, i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(R * (1.18 + i * 0.12), 0.012, 8, 160),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: blendMode(THREE) }),
    );
    ring.rotation.x = Math.PI / (2.3 + i * 0.6);
    scene.add(ring);
    return ring;
  });
  const core = glow(THREE, VIOLET, 4.5, 0.25);
  scene.add(core);

  const order = nodes.map((_, i) => i).sort((a, b) => ((a * 7919) % 37) - ((b * 7919) % 37));
  const rankOf = new Map(order.map((node, rank) => [node, rank]));
  const LOOP = 12;
  const dark = new THREE.Color(night() ? 0x2c2950 : 0xd5cfee);
  const hot = new THREE.Color(CORAL);

  return {
    update(t, dt, pointer) {
      globe.rotation.y += dt * 0.25 + pointer.x * dt * 0.8;
      globe.rotation.x += (pointer.y * 0.35 - globe.rotation.x) * 0.05;
      rings.forEach((ring, i) => (ring.rotation.z += dt * (0.15 + i * 0.1)));
      const k = (t % LOOP) / LOOP;
      const downs = Math.floor(N * 0.6);
      const goneCount = k < 0.85 ? Math.floor(clamp01((k - 0.1) / 0.7) * downs) : 0;
      nodes.forEach((node, i) => {
        const rank = rankOf.get(i)!;
        const material = node.mesh.material as ThreeNS.MeshBasicMaterial;
        if (rank < goneCount) {
          const since = (k - (0.1 + (rank / downs) * 0.7)) * LOOP;
          const flashing = since < 0.4;
          material.color.copy(flashing ? hot : dark);
          node.halo.material.color.copy(flashing ? hot : dark);
          node.halo.material.opacity = flashing ? 1 : 0.15;
          node.halo.scale.setScalar(flashing ? 1.6 - since * 2 : 0.5);
        } else {
          material.color.setHex(node.color);
          node.halo.material.color.setHex(node.color);
          node.halo.material.opacity = 0.8;
          node.halo.scale.setScalar(0.7 + Math.sin(t * 3 + i) * 0.12);
        }
      });
      (links.material as ThreeNS.LineBasicMaterial).opacity = 0.5 - (goneCount / N) * 0.4;
    },
  };
}

/* ------------------------------ detectors ------------------------------ */

/* A pixel grid that looks ordinary until a scanner beam sweeps across it:
 * under the beam, hidden rings of colour light up — the traces a generator
 * leaves — and fade slowly after it passes. */
function buildDetectors(THREE: Three, scene: ThreeNS.Scene, camera: ThreeNS.PerspectiveCamera): Built {
  camera.position.set(0, 0, 6.2);
  const root = new THREE.Group();
  scene.add(root);
  const COLS = 22;
  const ROWS = 12;
  const CELL = 0.26;
  const geometry = new THREE.BoxGeometry(CELL * 0.86, CELL * 0.86, 0.05);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const grid = new THREE.InstancedMesh(geometry, material, COLS * ROWS);
  root.add(grid);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const base = new THREE.Color(night() ? 0x2b2660 : 0xece8ff);
  const heat = new Float32Array(COLS * ROWS);
  const hidden: number[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const i = r * COLS + c;
      matrix.setPosition((c - (COLS - 1) / 2) * CELL, (r - (ROWS - 1) / 2) * CELL, 0);
      grid.setMatrixAt(i, matrix);
      grid.setColorAt(i, base);
      // Hidden pattern: concentric rings around an off-centre point.
      const d = Math.hypot(c - COLS * 0.62, (r - ROWS * 0.45) * 1.2);
      hidden.push(Math.abs(Math.sin(d * 0.9)) > 0.75 ? Math.floor(d) % LAB_COLORS.length : -1);
    }
  }
  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, ROWS * CELL + 0.8),
    new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.25, blending: blendMode(THREE), depthWrite: false }),
  );
  beam.position.z = 0.1;
  root.add(beam);
  const beamLine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.04, ROWS * CELL + 0.8),
    new THREE.MeshBasicMaterial({ color: fg(), transparent: true, opacity: 0.9, blending: blendMode(THREE) }),
  );
  beamLine.position.z = 0.12;
  root.add(beamLine);
  const width = COLS * CELL;
  const LOOP = 4.5;
  const idle = new THREE.Color(night() ? 0x4a4290 : 0xd2c8ff);
  const palette = LAB_COLORS.map((c) => new THREE.Color(c));

  return {
    update(t, dt, pointer) {
      fitWidth(camera, 6.2, width + 1.4);
      lean(root, pointer, 0.3);
      const k = (t % LOOP) / LOOP;
      const x = -width / 2 - 0.6 + k * (width + 1.2);
      beam.position.x = x;
      beamLine.position.x = x;
      for (let r = 0; r < ROWS; r += 1) {
        for (let c = 0; c < COLS; c += 1) {
          const i = r * COLS + c;
          const cx = (c - (COLS - 1) / 2) * CELL;
          if (Math.abs(cx - x) < CELL && hidden[i] >= 0) heat[i] = 1;
          heat[i] = Math.max(0, heat[i] - dt * 0.35);
          if (hidden[i] >= 0) {
            color.lerpColors(base, palette[hidden[i]], heat[i]);
          } else {
            color.lerpColors(base, idle, 0.3 + 0.2 * Math.sin(t * 2 + i));
          }
          grid.setColorAt(i, color);
          matrix.setPosition(cx, (r - (ROWS - 1) / 2) * CELL, heat[i] * 0.4);
          grid.setMatrixAt(i, matrix);
        }
      }
      grid.instanceMatrix.needsUpdate = true;
      if (grid.instanceColor) grid.instanceColor.needsUpdate = true;
    },
  };
}

/* ------------------------------- protect ------------------------------- */

/* A picture under a shimmering, iridescent cloak. Now and then a morphing
 * ray comes in and breaks up against the cloak instead of reaching the
 * picture. */
function buildProtect(THREE: Three, scene: ThreeNS.Scene, camera: ThreeNS.PerspectiveCamera): Built {
  camera.position.set(0, 0, 7.5);
  const root = new THREE.Group();
  scene.add(root);
  const texture = blobTexture(THREE, 5);
  const picture = new THREE.Mesh(roundedTile(THREE, 2.2, 2.2, 0.2, 0.08), new THREE.MeshBasicMaterial({ map: texture }));
  root.add(picture);

  // A lighter cloak on phones: the same look with fewer points.
  const SEG = isLowPower() ? 18 : 26;
  const cloakGeo = new THREE.PlaneGeometry(3.4, 3.4, SEG, SEG);
  const count = cloakGeo.attributes.position.count;
  cloakGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const cloak = new THREE.Points(
    cloakGeo,
    new THREE.PointsMaterial({ size: 0.11, map: glowTexture(THREE), vertexColors: true, transparent: true, blending: blendMode(THREE), depthWrite: false }),
  );
  cloak.position.z = 0.4;
  root.add(cloak);
  const basePositions = Float32Array.from(cloakGeo.attributes.position.array as Float32Array);

  // The incoming ray: a short streak of particles.
  const RAY = 40;
  const rayGeo = new THREE.BufferGeometry();
  rayGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RAY * 3), 3));
  const ray = new THREE.Points(
    rayGeo,
    new THREE.PointsMaterial({ size: 0.16, color: CORAL, map: glowTexture(THREE), transparent: true, blending: blendMode(THREE), depthWrite: false }),
  );
  root.add(ray);
  const spread = Array.from({ length: RAY }, () => new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, Math.random() * 1.5));

  const c = new THREE.Color();
  const lightness = night() ? 0.5 : 0.55;
  const LOOP = 5;
  return {
    update(t, _dt, pointer) {
      lean(root, pointer, 0.35);
      const pos = cloakGeo.attributes.position as ThreeNS.BufferAttribute;
      const col = cloakGeo.attributes.color as ThreeNS.BufferAttribute;
      const k = (t % LOOP) / LOOP;
      const hit = k > 0.35 && k < 0.6 ? Math.sin(((k - 0.35) / 0.25) * Math.PI) : 0;
      for (let i = 0; i < count; i += 1) {
        const x = basePositions[i * 3];
        const y = basePositions[i * 3 + 1];
        const d = Math.hypot(x - 0.6, y - 0.5);
        const wave = Math.sin(x * 2.2 + t * 1.6) * 0.12 + Math.cos(y * 2.6 - t * 1.3) * 0.12 + Math.sin(d * 8 - t * 10) * 0.25 * hit * Math.exp(-d);
        pos.setZ(i, wave);
        c.setHSL((x * 0.12 + y * 0.09 + t * 0.1 + 1) % 1, 1, lightness + wave * 0.5);
        col.setXYZ(i, c.r, c.g, c.b);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      const rp = rayGeo.attributes.position as ThreeNS.BufferAttribute;
      const travel = clamp01((k - 0.1) / 0.28);
      const burst = clamp01((k - 0.38) / 0.3);
      for (let i = 0; i < RAY; i += 1) {
        const lag = i / RAY;
        if (burst <= 0) {
          const p = clamp01(travel - lag * 0.3);
          rp.setXYZ(i, 4.5 - p * 3.9, 3 - p * 2.5, 2.5 - p * 2);
        } else {
          const s = spread[i];
          rp.setXYZ(i, 0.6 + s.x * burst * 1.6, 0.5 + s.y * burst * 1.6, 0.5 + s.z * burst);
        }
      }
      rp.needsUpdate = true;
      (ray.material as ThreeNS.PointsMaterial).opacity = k < 0.1 ? 0 : 1 - clamp01((k - 0.6) / 0.25);
    },
    dispose() {
      texture.dispose();
    },
  };
}

/* ---------------------------- message check ---------------------------- */

/* Chat bubbles orbit a glowing core. One at a time, a bubble is flagged: it
 * turns coral, a warning ring pulses around it, and it is pulled aside. */
function buildMessageCheck(THREE: Three, scene: ThreeNS.Scene, camera: ThreeNS.PerspectiveCamera): Built {
  camera.position.set(0, 1.2, 8.5);
  camera.lookAt(0, 0, 0);
  const root = new THREE.Group();
  scene.add(root);
  const core = glow(THREE, VIOLET, 3.2, 0.6);
  root.add(core);
  const N = 6;
  const bubbleGeo = roundedTile(THREE, 1.5, 0.85, 0.3, 0.1);
  const lineGeo = new THREE.PlaneGeometry(1, 0.09);
  const bubbles = Array.from({ length: N }, (_, i) => {
    const group = new THREE.Group();
    const color = [TEAL, SKY, VIOLET, PINK, AMBER, TEAL][i];
    const body = new THREE.Mesh(bubbleGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    group.add(body);
    [0.18, -0.02, -0.22].forEach((y, j) => {
      const bar = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }));
      bar.scale.x = [0.95, 0.75, 0.5][j];
      bar.position.set(-0.55 + bar.scale.x / 2, y, 0.06);
      group.add(bar);
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.02, 48),
      new THREE.MeshBasicMaterial({ color: CORAL, transparent: true, opacity: 0, blending: blendMode(THREE), side: THREE.DoubleSide }),
    );
    group.add(ring);
    root.add(group);
    return { group, body, ring, color };
  });
  const hot = new THREE.Color(CORAL);
  const PER = 2.2;
  return {
    update(t, _dt, pointer) {
      fitWidth(camera, 8.5, 8.6);
      root.rotation.y += (pointer.x * 0.3 - root.rotation.y) * 0.06;
      const flagged = Math.floor(t / PER) % N;
      const f = (t % PER) / PER;
      bubbles.forEach((bubble, i) => {
        const a = (i / N) * Math.PI * 2 + t * 0.35;
        const pull = i === flagged ? Math.sin(f * Math.PI) : 0;
        bubble.group.position.set(Math.cos(a) * (3 + pull * 0.6), Math.sin(t * 1.3 + i) * 0.25 + pull * 0.6, Math.sin(a) * 1.6);
        bubble.group.lookAt(camera.position);
        bubble.group.rotation.z += Math.sin(t * 8) * 0.06 * pull;
        (bubble.body.material as ThreeNS.MeshBasicMaterial).color.setHex(bubble.color).lerp(hot, pull);
        (bubble.ring.material as ThreeNS.MeshBasicMaterial).opacity = pull;
        bubble.ring.scale.setScalar(1 + ((t * 2) % 1) * 0.4 * pull);
      });
      core.material.opacity = 0.45 + Math.sin(t * 2) * 0.15;
    },
  };
}

/* -------------------------------- stamp -------------------------------- */

/* A holographic seal spins down onto a picture, presses, and leaves a
 * rainbow credential mark that shimmers and slowly fades. */
function buildStamp(THREE: Three, scene: ThreeNS.Scene, camera: ThreeNS.PerspectiveCamera): Built {
  camera.position.set(0, -2.6, 9.5);
  camera.lookAt(0, 0.3, 0);
  const root = new THREE.Group();
  scene.add(root);
  const texture = blobTexture(THREE, 1);
  const picture = new THREE.Mesh(roundedTile(THREE, 2.8, 2.8, 0.2, 0.08), new THREE.MeshBasicMaterial({ map: texture }));
  root.add(picture);

  const seal = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.07, 12, 64), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  seal.add(outer);
  const teeth = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: AMBER, wireframe: true }));
  seal.add(teeth);
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: SKY, wireframe: true }));
  seal.add(star);
  root.add(seal);

  const mark = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.95, 64),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: blendMode(THREE), side: THREE.DoubleSide }),
  );
  mark.position.z = 0.06;
  root.add(mark);
  const flash = glow(THREE, night() ? 0xffffff : AMBER, 4, 0);
  flash.position.z = 0.2;
  root.add(flash);

  const c = new THREE.Color();
  const LOOP = 5;
  return {
    update(t, _dt, pointer) {
      lean(root, pointer, 0.35);
      const k = (t % LOOP) / LOOP;
      const down = ease(k / 0.35);
      const lift = ease((k - 0.45) / 0.25);
      seal.position.set(0, 0, 3 - down * 2.85 + lift * 2.85);
      seal.rotation.z = t * 2.2;
      star.rotation.y = t * 3;
      const press = k > 0.35 && k < 0.45 ? Math.sin(((k - 0.35) / 0.1) * Math.PI) : 0;
      seal.scale.set(1 + press * 0.15, 1 + press * 0.15, 1 - press * 0.5);
      c.setHSL((t * 0.25) % 1, 0.85, 0.6);
      (outer.material as ThreeNS.MeshBasicMaterial).color.copy(c);
      const markOn = k > 0.38 ? 1 - clamp01((k - 0.7) / 0.28) : 0;
      const markMaterial = mark.material as ThreeNS.MeshBasicMaterial;
      markMaterial.opacity = markOn * 0.85;
      markMaterial.color.setHSL((t * 0.4 + 0.5) % 1, 0.9, 0.6);
      mark.rotation.z = -t * 0.5;
      flash.material.opacity = press;
    },
    dispose() {
      texture.dispose();
    },
  };
}

/* ---------------------------- spot the fake ---------------------------- */

/* Two cards flip like a game. One is real; the other glitches — its slices
 * slip sideways with a split-colour shimmer — and gets a coral ring when the
 * cards turn face up. */
function buildSpotTheFake(THREE: Three, scene: ThreeNS.Scene, camera: ThreeNS.PerspectiveCamera): Built {
  camera.position.set(0, 0, 7.4);
  const root = new THREE.Group();
  scene.add(root);
  const texture = blobTexture(THREE, 2);
  const clones: ThreeNS.Texture[] = [];
  const W = 1.9;
  const H = 2.5;
  const back = new THREE.MeshBasicMaterial({ color: night() ? 0x2a2458 : 0x7b61ff });
  const makeCard = (x: number, sliced: boolean) => {
    const card = new THREE.Group();
    card.position.x = x;
    const backFace = new THREE.Mesh(roundedTile(THREE, W, H, 0.2, 0.05), back);
    backFace.position.z = -0.03;
    card.add(backFace);
    const pattern = new THREE.Line(roundedOutline(THREE, W - 0.3, H - 0.3, 0.15), new THREE.LineBasicMaterial({ color: night() ? VIOLET : 0xffffff }));
    pattern.position.z = -0.06;
    card.add(pattern);
    const slices: ThreeNS.Mesh[] = [];
    const N = sliced ? 7 : 1;
    for (let i = 0; i < N; i += 1) {
      const sliceTexture = texture.clone();
      sliceTexture.repeat.set(1, 1 / N);
      sliceTexture.offset.set(0, i / N);
      sliceTexture.needsUpdate = true;
      clones.push(sliceTexture);
      const slice = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.12, (H - 0.12) / N), new THREE.MeshBasicMaterial({ map: sliceTexture }));
      slice.position.set(0, -H / 2 + 0.06 + ((i + 0.5) * (H - 0.12)) / N, 0.01);
      card.add(slice);
      slices.push(slice);
    }
    const ring = new THREE.Line(
      roundedOutline(THREE, W + 0.25, H + 0.25, 0.3),
      new THREE.LineBasicMaterial({ color: sliced ? CORAL : TEAL, transparent: true, opacity: 0, blending: blendMode(THREE) }),
    );
    ring.position.z = 0.02;
    card.add(ring);
    root.add(card);
    return { card, slices, ring };
  };
  const left = makeCard(-1.3, false);
  const right = makeCard(1.3, true);
  const LOOP = 6;
  return {
    update(t, _dt, pointer) {
      fitWidth(camera, 7.4, 6.6);
      lean(root, pointer, 0.25);
      const k = (t % LOOP) / LOOP;
      // Face down, flip up (0.1–0.3), glitch and ring (0.3–0.75), flip down.
      const up = ease((k - 0.1) / 0.2) * (1 - ease((k - 0.8) / 0.15));
      [left, right].forEach((side, i) => {
        side.card.rotation.y = Math.PI * (1 - up) + Math.sin(t * 1.2 + i) * 0.08;
        side.card.position.y = Math.sin(t * 1.5 + i * 2) * 0.12;
        (side.ring.material as ThreeNS.LineBasicMaterial).opacity = up > 0.95 && k > 0.45 ? 0.6 + 0.4 * Math.sin(t * 10) : 0;
      });
      const glitching = up > 0.9 && k > 0.3 && k < 0.75;
      right.slices.forEach((slice, i) => {
        const jitter = glitching && Math.sin(t * 23 + i * 7) > 0.55 ? Math.sin(t * 40 + i) * 0.18 : 0;
        slice.position.x = jitter;
        (slice.material as ThreeNS.MeshBasicMaterial).color.setHex(jitter > 0.05 ? PINK : jitter < -0.05 ? SKY : 0xffffff);
      });
    },
    dispose() {
      texture.dispose();
      clones.forEach((clone) => clone.dispose());
    },
  };
}

/* ------------------------------ open tools ------------------------------ */

/* A constellation of different tools — each a neon wireframe solid —
 * orbiting a shared core, linked to it by faint light. */
function buildOpenTools(THREE: Three, scene: ThreeNS.Scene, camera: ThreeNS.PerspectiveCamera): Built {
  camera.position.set(0, 1, 8.5);
  camera.lookAt(0, 0, 0);
  const root = new THREE.Group();
  scene.add(root);
  root.add(glow(THREE, TEAL, 3.5, 0.55));
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshBasicMaterial({ color: fg(), wireframe: true }));
  root.add(core);
  const shapes = [
    new THREE.TorusKnotGeometry(0.32, 0.1, 64, 8),
    new THREE.OctahedronGeometry(0.45),
    new THREE.TorusGeometry(0.38, 0.13, 10, 24),
    new THREE.ConeGeometry(0.38, 0.7, 6),
    new THREE.DodecahedronGeometry(0.42),
    new THREE.BoxGeometry(0.6, 0.6, 0.6),
  ];
  const orbiters = shapes.map((geometry, i) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: LAB_COLORS[i], wireframe: true }));
    root.add(mesh);
    const halo = glow(THREE, LAB_COLORS[i], 1.4, 0.5);
    root.add(halo);
    return { mesh, halo, radius: 2.3 + (i % 3) * 0.45, speed: 0.35 + i * 0.05, tilt: (i - 2.5) * 0.18, phase: i };
  });
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(orbiters.length * 6), 3));
  const links = new THREE.LineSegments(linkGeo, new THREE.LineBasicMaterial({ color: fg(), transparent: true, opacity: night() ? 0.18 : 0.25, blending: blendMode(THREE) }));
  root.add(links);
  return {
    update(t, _dt, pointer) {
      fitWidth(camera, 8.5, 7.6);
      lean(root, pointer, 0.3);
      core.rotation.set(t * 0.4, t * 0.6, 0);
      const lp = linkGeo.attributes.position as ThreeNS.BufferAttribute;
      orbiters.forEach((o, i) => {
        const a = t * o.speed + o.phase;
        o.mesh.position.set(Math.cos(a) * o.radius, Math.sin(a * 1.3) * 0.5 + o.tilt * Math.sin(a) * 2, Math.sin(a) * o.radius * 0.6);
        o.mesh.rotation.set(t * (0.5 + i * 0.1), t * 0.7, 0);
        o.halo.position.copy(o.mesh.position);
        lp.setXYZ(i * 2, 0, 0, 0);
        lp.setXYZ(i * 2 + 1, o.mesh.position.x, o.mesh.position.y, o.mesh.position.z);
      });
      lp.needsUpdate = true;
    },
  };
}

/* -------------------------------- stacks -------------------------------- */

/* Glowing slabs drop one by one and lock into a tower — a stack of tools
 * set up in order — then lift away and the tower rebuilds. */
function buildStacks(THREE: Three, scene: ThreeNS.Scene, camera: ThreeNS.PerspectiveCamera): Built {
  camera.position.set(3.4, 2.8, 7.2);
  camera.lookAt(0, 0.4, 0);
  const root = new THREE.Group();
  scene.add(root);
  const LAYERS = 5;
  const slabGeo = roundedTile(THREE, 2.4, 2.4, 0.3, 0.32);
  slabGeo.rotateX(-Math.PI / 2);
  const edgeGeo = roundedOutline(THREE, 2.4, 2.4, 0.3);
  const slabs = Array.from({ length: LAYERS }, (_, i) => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(slabGeo, new THREE.MeshBasicMaterial({ color: LAB_COLORS[i], transparent: true, opacity: 0.55 }));
    group.add(body);
    [0.17, -0.17].forEach((y) => {
      const edge = new THREE.Line(edgeGeo, new THREE.LineBasicMaterial({ color: LAB_COLORS[i] }));
      edge.rotation.x = -Math.PI / 2;
      edge.position.y = y;
      group.add(edge);
    });
    root.add(group);
    return { group, body };
  });
  const base = glow(THREE, VIOLET, 6, 0.4);
  base.position.y = -0.6;
  root.add(base);
  const LOOP = 7;
  return {
    update(t, _dt, pointer) {
      root.rotation.y = t * 0.3 + pointer.x * 0.6;
      const k = (t % LOOP) / LOOP;
      const away = ease((k - 0.82) / 0.15);
      slabs.forEach((slab, i) => {
        const start = 0.05 + i * 0.12;
        const drop = ease((k - start) / 0.12);
        const restY = -0.4 + i * 0.42;
        slab.group.position.y = restY + (1 - drop) * 4 + away * (2 + i * 0.6);
        slab.group.rotation.y = (1 - drop) * 1.2;
        slab.group.visible = k >= start;
        (slab.body.material as ThreeNS.MeshBasicMaterial).opacity = 0.55 * (1 - away);
      });
    },
  };
}
