"use client";

import { useEffect, useRef, useState } from "react";
import type * as ThreeNS from "three";

/*
 * Decorative Three.js scenes for the AI Lab (prototype, 2026-11-23).
 * Each scene is abstract — coloured tiles, light, networks — and never shows
 * a real image or a person. The canvas is aria-hidden; the text beside it
 * says what the tool does. Three.js loads only near the screen, never under
 * prefers-reduced-motion or without WebGL (a static gradient shows instead),
 * pauses off screen, and caps the pixel ratio so phones stay cool.
 */

export type LabSceneKind = "hero" | "trace" | "tracker";

type Three = typeof ThreeNS;
type Built = { update: (t: number, dt: number, pointer: { x: number; y: number }) => void; dispose?: () => void };
type Builder = (THREE: Three, scene: ThreeNS.Scene, camera: ThreeNS.PerspectiveCamera) => Built;

// The Lab palette: the site's teal and coral plus violet, amber and sky.
export const LAB_COLORS = [0x0f8a80, 0xff7a59, 0x7c5cff, 0xf5b52e, 0x38b6ff, 0xe8508a];

const BUILDERS: Record<LabSceneKind, Builder> = { hero: buildHero, trace: buildTrace, tracker: buildTracker };

export function LabScene({ kind, className = "" }: { kind: LabSceneKind; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const probe = document.createElement("canvas");
    const probeContext = probe.getContext("webgl2") || probe.getContext("webgl");
    if (!probeContext) return;
    probeContext.getExtension("WEBGL_lose_context")?.loseContext();

    let disposed = false;
    let cleanup: (() => void) | undefined;

    const start = async () => {
      const THREE = await import("three");
      if (disposed) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      const built = BUILDERS[kind](THREE, scene, camera);
      setLive(true);

      const resize = () => {
        const w = el.clientWidth || 1;
        const h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      const pointer = { x: 0, y: 0 };
      const onMove = (event: PointerEvent) => {
        const r = el.getBoundingClientRect();
        pointer.x = ((event.clientX - r.left) / r.width) * 2 - 1;
        pointer.y = -(((event.clientY - r.top) / r.height) * 2 - 1);
      };
      const onLeave = () => {
        pointer.x = 0;
        pointer.y = 0;
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);

      let visible = true;
      const io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
      });
      io.observe(el);

      const clock = new THREE.Clock();
      let t = 0;
      let raf = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(clock.getDelta(), 0.05);
        if (!visible || document.hidden) return;
        t += dt;
        built.update(t, dt, pointer);
        renderer.render(scene, camera);
      };
      loop();

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
        built.dispose?.();
        scene.traverse((object) => {
          const mesh = object as ThreeNS.Mesh;
          mesh.geometry?.dispose?.();
          const material = mesh.material as ThreeNS.Material | ThreeNS.Material[] | undefined;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material?.dispose?.();
        });
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    };

    // Start only when the scene comes near the screen.
    const near = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          near.disconnect();
          start().catch(() => undefined);
        }
      },
      { rootMargin: "200px" },
    );
    near.observe(el);

    return () => {
      disposed = true;
      near.disconnect();
      cleanup?.();
    };
  }, [kind]);

  return <div ref={host} className={`lab-scene lab-scene-${kind} ${live ? "is-live" : ""} ${className}`} aria-hidden="true" />;
}

/* ---------------------------------------------------------------------- */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => {
  const k = clamp01(x);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};

function roundedTile(THREE: Three, w: number, h: number, r: number, depth: number) {
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
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/** A small canvas texture: a soft gradient "picture" made of blobs, no real image. */
function blobTexture(THREE: Three, seed: number) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const pick = (i: number) => `#${LAB_COLORS[(seed + i) % LAB_COLORS.length].toString(16).padStart(6, "0")}`;
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

/* Hero: a floating grid of colourful "pictures". Now and then one cracks into
 * four shards that drift apart and shift colour (a morph), then snap back to
 * where they came from (traced to the source). Tiles lean toward the pointer. */
function buildHero(THREE: Three, scene: ThreeNS.Scene, camera: ThreeNS.PerspectiveCamera): Built {
  camera.position.set(0, 0, 16);
  const COLS = 13;
  const ROWS = 5;
  const SIZE = 1.25;
  const GAP = 0.32;
  const group = new THREE.Group();
  scene.add(group);

  const tileGeo = roundedTile(THREE, SIZE, SIZE, 0.16, 0.12);
  const shardGeo = roundedTile(THREE, SIZE / 2 - 0.03, SIZE / 2 - 0.03, 0.08, 0.12);
  const textures = Array.from({ length: 8 }, (_, i) => blobTexture(THREE, i));

  type Tile = { mesh: ThreeNS.Mesh; home: ThreeNS.Vector3; phase: number; shards: ThreeNS.Mesh[]; crackAt: number };
  const tiles: Tile[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const i = r * COLS + c;
      const material = new THREE.MeshBasicMaterial({ map: textures[i % textures.length] });
      const mesh = new THREE.Mesh(tileGeo, material);
      const home = new THREE.Vector3((c - (COLS - 1) / 2) * (SIZE + GAP), (r - (ROWS - 1) / 2) * (SIZE + GAP), 0);
      mesh.position.copy(home);
      group.add(mesh);
      const shards: ThreeNS.Mesh[] = [];
      for (let s = 0; s < 4; s += 1) {
        const shard = new THREE.Mesh(shardGeo, new THREE.MeshBasicMaterial({ color: LAB_COLORS[(i + s) % LAB_COLORS.length], transparent: true, opacity: 0 }));
        shard.visible = false;
        group.add(shard);
        shards.push(shard);
      }
      tiles.push({ mesh, home, phase: (c * 0.6 + r * 0.9) % (Math.PI * 2), shards, crackAt: -99 });
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
      group.rotation.y += (pointer.x * 0.25 - group.rotation.y) * 0.05;
      group.rotation.x += (-pointer.y * 0.18 - group.rotation.x) * 0.05;

      if (t > nextCrack) {
        const idle = tiles.filter((tile) => t - tile.crackAt > CRACK);
        const pick = idle[Math.floor(Math.random() * idle.length)];
        if (pick) pick.crackAt = t;
        nextCrack = t + 0.7 + Math.random() * 0.6;
      }

      for (const tile of tiles) {
        const wave = Math.sin(t * 1.1 + tile.phase);
        tile.mesh.position.set(tile.home.x, tile.home.y + wave * 0.08, tile.home.z + wave * 0.35);
        tile.mesh.rotation.set(wave * 0.06, Math.cos(t * 0.9 + tile.phase) * 0.08, 0);

        const k = (t - tile.crackAt) / CRACK;
        const cracking = k >= 0 && k < 1;
        tile.mesh.visible = !cracking;
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
          const material = shard.material as ThreeNS.MeshBasicMaterial;
          material.opacity = 0.95;
          material.color.setHex(LAB_COLORS[(s + Math.floor(t * 2.5)) % LAB_COLORS.length]);
        });
      }
    },
    dispose() {
      textures.forEach((texture) => texture.dispose());
    },
  };
}

/* Trace: a source picture and a cropped, tilted copy. Matching points light
 * up on both, threads draw between them, and the cropped piece flies back
 * and docks on the source. */
function buildTrace(THREE: Three, scene: ThreeNS.Scene, camera: ThreeNS.PerspectiveCamera): Built {
  camera.position.set(0, 0, 7.2);
  const texture = blobTexture(THREE, 3);
  const SIZE = 2.6;
  const source = new THREE.Mesh(roundedTile(THREE, SIZE, SIZE, 0.18, 0.08), new THREE.MeshBasicMaterial({ map: texture }));
  source.position.set(-2.1, 0, 0);
  scene.add(source);

  // The copy shows only the top-right quarter of the same picture, enlarged.
  const copyTexture = texture.clone();
  copyTexture.repeat.set(0.5, 0.5);
  copyTexture.offset.set(0.5, 0.5);
  copyTexture.needsUpdate = true;
  const copy = new THREE.Mesh(roundedTile(THREE, SIZE * 0.82, SIZE * 0.82, 0.18, 0.08), new THREE.MeshBasicMaterial({ map: copyTexture }));
  copy.position.set(2.2, 0, 0);
  scene.add(copy);

  // A ghost frame on the source where the crop came from.
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(SIZE / 2, SIZE / 2)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
  );
  frame.position.set(source.position.x + SIZE / 4, SIZE / 4, 0.1);
  scene.add(frame);

  // Matching points: in the crop's space (u, v in 0..1 of the quarter).
  const points = [
    [0.2, 0.3],
    [0.7, 0.2],
    [0.5, 0.6],
    [0.8, 0.8],
    [0.3, 0.85],
  ];
  const dotGeo = new THREE.CircleGeometry(0.07, 16);
  const threads: { line: ThreeNS.Line; a: ThreeNS.Vector3; b: ThreeNS.Vector3; dots: ThreeNS.Mesh[]; color: number }[] = [];
  points.forEach(([u, v], i) => {
    const color = LAB_COLORS[(i + 1) % LAB_COLORS.length];
    const a = new THREE.Vector3(source.position.x + (u * 0.5) * SIZE, (v * 0.5) * SIZE, 0.12);
    const cs = SIZE * 0.82;
    const b = new THREE.Vector3(copy.position.x - cs / 2 + u * cs, -cs / 2 + v * cs, 0.12);
    const dots = [a, b].map((p) => {
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }));
      dot.position.copy(p);
      scene.add(dot);
      return dot;
    });
    const geometry = new THREE.BufferGeometry().setFromPoints([a.clone(), a.clone()]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    scene.add(line);
    threads.push({ line, a, b, dots, color });
  });

  const LOOP = 7;
  const copyHome = copy.position.clone();
  const dock = new THREE.Vector3(source.position.x + SIZE / 4, SIZE / 4, 0.3);

  return {
    update(t, _dt, pointer) {
      scene.rotation.y += (pointer.x * 0.2 - scene.rotation.y) * 0.06;
      const k = (t % LOOP) / LOOP;
      // 0–0.15 copy tilts in; 0.15–0.45 dots and threads; 0.5–0.75 copy flies home; 0.85–1 reset.
      const tilt = ease(k / 0.15);
      copy.rotation.z = -0.18 * tilt;
      threads.forEach((thread, i) => {
        const start = 0.15 + i * 0.05;
        const draw = ease((k - start) / 0.12);
        const fade = 1 - ease((k - 0.5) / 0.1);
        thread.dots.forEach((dot) => ((dot.material as ThreeNS.MeshBasicMaterial).opacity = ease((k - start) / 0.04) * fade));
        const end = thread.b.clone().lerp(thread.a, 1 - draw);
        const positions = thread.line.geometry.attributes.position as ThreeNS.BufferAttribute;
        positions.setXYZ(0, thread.a.x, thread.a.y, thread.a.z);
        positions.setXYZ(1, end.x, end.y, end.z);
        positions.needsUpdate = true;
        (thread.line.material as ThreeNS.LineBasicMaterial).opacity = 0.9 * fade;
        // Follow the copy's tilt for the copy-side dot.
        thread.dots[1].position.copy(thread.b);
      });
      const fly = ease((k - 0.5) / 0.25);
      const back = ease((k - 0.88) / 0.1);
      const scale = 1 - fly * (1 - 0.5 / 0.82);
      copy.position.lerpVectors(copyHome, dock, fly * (1 - back));
      copy.scale.setScalar(scale + (1 - scale) * back);
      copy.rotation.z = -0.18 * tilt * (1 - fly);
      (copy.material as ThreeNS.MeshBasicMaterial).opacity = 1;
      (frame.material as ThreeNS.LineBasicMaterial).opacity = ease((k - 0.7) / 0.08) * (1 - back);
    },
    dispose() {
      texture.dispose();
      copyTexture.dispose();
    },
  };
}

/* Tracker: a slowly turning globe of services linked to each other. One by
 * one, nodes flash and go dark (taken down); the network then lights up again. */
function buildTracker(THREE: Three, scene: ThreeNS.Scene, camera: ThreeNS.PerspectiveCamera): Built {
  camera.position.set(0, 0, 9);
  const globe = new THREE.Group();
  scene.add(globe);
  const N = 34;
  const R = 2.4;
  const nodes: { mesh: ThreeNS.Mesh; color: number; downAt: number }[] = [];
  const positions: ThreeNS.Vector3[] = [];
  const nodeGeo = new THREE.SphereGeometry(0.12, 16, 12);
  for (let i = 0; i < N; i += 1) {
    // Fibonacci sphere: evenly spread points.
    const y = 1 - (i / (N - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = i * 2.399963;
    const p = new THREE.Vector3(Math.cos(theta) * radius * R, y * R, Math.sin(theta) * radius * R);
    positions.push(p);
    const color = LAB_COLORS[i % LAB_COLORS.length];
    const mesh = new THREE.Mesh(nodeGeo, new THREE.MeshBasicMaterial({ color }));
    mesh.position.copy(p);
    globe.add(mesh);
    nodes.push({ mesh, color, downAt: Infinity });
  }
  // Link each node to its two nearest neighbours.
  const linkPoints: ThreeNS.Vector3[] = [];
  positions.forEach((p, i) => {
    const nearest = positions
      .map((q, j) => ({ j, d: p.distanceTo(q) }))
      .filter((e) => e.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    nearest.forEach(({ j }) => linkPoints.push(p, positions[j]));
  });
  const links = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(linkPoints),
    new THREE.LineBasicMaterial({ color: 0x7c5cff, transparent: true, opacity: 0.35 }),
  );
  globe.add(links);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(R * 1.12, 0.015, 8, 120),
    new THREE.MeshBasicMaterial({ color: 0x38b6ff, transparent: true, opacity: 0.5 }),
  );
  ring.rotation.x = Math.PI / 2.3;
  scene.add(ring);

  const order = nodes.map((_, i) => i).sort((a, b) => ((a * 7919) % 31) - ((b * 7919) % 31));
  const LOOP = 12;
  const grey = new THREE.Color(0xcfcac6);

  return {
    update(t, dt, pointer) {
      globe.rotation.y += dt * 0.25 + pointer.x * dt * 0.6;
      globe.rotation.x += (pointer.y * 0.3 - globe.rotation.x) * 0.05;
      ring.rotation.z += dt * 0.15;
      const k = (t % LOOP) / LOOP;
      // Nodes go down over 0.1–0.8 of the loop, then all come back.
      const goneCount = k < 0.85 ? Math.floor(clamp01((k - 0.1) / 0.7) * N * 0.6) : 0;
      nodes.forEach((node, i) => {
        const rank = order.indexOf(i);
        const material = node.mesh.material as ThreeNS.MeshBasicMaterial;
        if (rank < goneCount) {
          const since = (k - (0.1 + (rank / (N * 0.6)) * 0.7)) * LOOP;
          const flash = since < 0.35 ? 1.9 - since * 2 : 1;
          material.color.copy(since < 0.35 ? new THREE.Color(0xff7a59) : grey);
          node.mesh.scale.setScalar(Math.max(0.55, flash * 0.8));
        } else {
          material.color.setHex(node.color);
          node.mesh.scale.setScalar(1 + Math.sin(t * 3 + i) * 0.12);
        }
      });
      (links.material as ThreeNS.LineBasicMaterial).opacity = 0.35 - (goneCount / N) * 0.3;
    },
  };
}
