"use client";

import { useEffect, useRef, useState } from "react";
import type { BufferGeometry, InstancedMesh, LineBasicMaterial, Material, Mesh, MeshBasicMaterial, Object3D, Points, PointsMaterial } from "three";

// The detailed, "tech" take on the takedown loop (Three.js, 18 s):
//  1. On the phone, a 16×16 PDQ fingerprint flickers and settles: computed on the device.
//  2. The link travels as a packet to the Asmita hub along a glowing path.
//  3. The hub assembles a notice; a signature draws across it.
//  4. The notice flies to a platform feed; the post dissolves (taken down).
//  5. The crawler's beam sweeps three platform feeds, a re-upload lights up,
//     the fingerprint links to it with a Hamming-distance readout, and it is
//     reported and dissolves again.
// The canvas is decorative (aria-hidden); the numbered steps under it tell the
// same story in text and highlight in time. Three.js loads only near the
// screen, never under prefers-reduced-motion or without WebGL, and pauses
// off screen.

export type FlowStep = { title: string; body: string };
export type FlowLabels = { device: string; hub: string; platforms: string; scanning: string; match: string; removed: string };

const LOOP = 18;
const STEP_TIMES = [0, 3.5, 5.2, 8.5, 12.4, 13.6];

const C = {
  bg: 0x07302d,
  grid: 0x1c5550,
  teal: 0x2bb3a6,
  tealDim: 0x1f6f68,
  mint: 0x9fe3d8,
  coral: 0xff9473,
  coralHot: 0xffb59c,
  gold: 0xf2d27a,
  white: 0xffffff,
  tile: 0x154743,
  tileLit: 0x2a6a63,
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => {
  const k = clamp01(x);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};
const phase = (t: number, a: number, b: number) => ease((t - a) / (b - a));
const between = (t: number, a: number, b: number) => t >= a && t < b;

// A fixed 256-bit pattern for the settled fingerprint (deterministic, invented).
const BITS = Array.from({ length: 256 }, (_, i) => ((i * 2654435761) >>> 0) % 7 < 3);

export function NoticeFlowTech({ steps, label, labels }: { steps: FlowStep[]; label: string; labels: FlowLabels }) {
  const host = useRef<HTMLDivElement>(null);
  const figure = useRef<HTMLElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const el = host.current;
    const watch = figure.current;
    const hudEl = hud.current;
    if (!el || !watch || !hudEl) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const probe = document.createElement("canvas");
    if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    const start = async () => {
      const THREE = await import("three");
      if (disposed) return;
      setAnimated(true);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(C.bg, 1);
      renderer.domElement.setAttribute("aria-hidden", "true");
      Object.assign(renderer.domElement.style, { display: "block", width: "100%", height: "100%" });
      el.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(C.bg, 26, 46);
      const camera = new THREE.PerspectiveCamera(32, 2, 0.1, 100);
      const focus = new THREE.Vector3(-0.6, 0, 0);

      const basic = (color: number, opacity = 1, additive = false) =>
        new THREE.MeshBasicMaterial({
          color,
          transparent: opacity < 1 || additive,
          opacity,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          depthWrite: !additive,
        });
      const lineMat = (color: number, opacity = 1) => new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
      const frame = (w: number, h: number, color: number, opacity = 1) => {
        const g = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-w / 2, -h / 2, 0), new THREE.Vector3(w / 2, -h / 2, 0),
          new THREE.Vector3(w / 2, h / 2, 0), new THREE.Vector3(-w / 2, h / 2, 0), new THREE.Vector3(-w / 2, -h / 2, 0),
        ]);
        return new THREE.Line(g, lineMat(color, opacity));
      };
      const glow = (radius: number, color: number, opacity = 0.35) =>
        new THREE.Mesh(new THREE.CircleGeometry(radius, 40), basic(color, opacity, true));

      // Floor grid
      const grid = new THREE.GridHelper(60, 60, C.grid, C.grid);
      grid.rotation.x = Math.PI / 2;
      grid.position.z = -0.6;
      const gm = grid.material as Material;
      gm.transparent = true;
      gm.opacity = 0.55;
      scene.add(grid);

      // ---- Phone with the 16×16 fingerprint ------------------------------------
      const phone = new THREE.Group();
      phone.position.set(-9, 0, 0);
      scene.add(phone);
      const body = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.6), basic(0x0c3d39));
      phone.add(body);
      const bodyFrame = frame(2.6, 4.6, C.teal);
      bodyFrame.position.z = 0.01;
      phone.add(bodyFrame);
      const cell = 0.12;
      const bits = new THREE.InstancedMesh(new THREE.PlaneGeometry(cell * 0.82, cell * 0.82), basic(C.white), 256);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < 256; i++) {
        const r = Math.floor(i / 16), c = i % 16;
        dummy.position.set((c - 7.5) * cell, (7.5 - r) * cell + 0.3, 0.02);
        dummy.updateMatrix();
        bits.setMatrixAt(i, dummy.matrix);
      }
      bits.instanceMatrix.needsUpdate = true;
      phone.add(bits);
      const bitColor = new THREE.Color();
      const printGlow = glow(1.6, C.teal, 0.12);
      printGlow.position.set(0, 0.3, -0.01);
      phone.add(printGlow);
      // a "link" bar under the print
      const linkBar = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.22), basic(C.coral));
      linkBar.position.set(0, -1.6, 0.02);
      phone.add(linkBar);

      // ---- The Asmita hub -------------------------------------------------------
      const hub = new THREE.Group();
      hub.position.set(-3.2, 0, 0);
      scene.add(hub);
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), new THREE.MeshBasicMaterial({ color: C.teal, wireframe: true }));
      hub.add(core);
      const coreGlow = glow(1.5, C.teal, 0.25);
      hub.add(coreGlow);
      const orbits: Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15 + i * 0.32, 0.012, 6, 90), basic(i === 1 ? C.gold : C.mint, 0.7));
        ring.rotation.set(Math.PI / 2.4 + i * 0.5, i * 0.7, 0);
        hub.add(ring);
        orbits.push(ring);
      }
      // the notice sheets that assemble at the hub
      const sheets: Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2), basic(C.white, 0.9));
        sheet.position.set(0, 2.6, 0.2 + i * 0.05);
        hub.add(sheet);
        sheets.push(sheet);
        for (let k = 0; k < 4; k++) {
          const row = new THREE.Mesh(new THREE.PlaneGeometry(k === 0 ? 0.8 : 1.1, 0.07), basic(k === 0 ? C.tealDim : 0xb9c7c5));
          row.position.set(k === 0 ? -0.15 : 0, 0.65 - k * 0.28, 0.01);
          sheet.add(row);
        }
      }
      const sig = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.06), basic(C.coral));
      sig.position.set(0, -0.7, 0.012);
      sheets[2].add(sig);

      // ---- Three platform feeds ----------------------------------------------------
      const COLS = 8, ROWS = 3;
      const feedPos = [new THREE.Vector3(5.6, 3.2, 0), new THREE.Vector3(5.6, 0, 0), new THREE.Vector3(5.6, -3.2, 0)];
      const tilesPer = COLS * ROWS;
      const tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.52, 0.52), basic(C.white), tilesPer * 3);
      const tileBase: Object3D[] = [];
      for (let f = 0; f < 3; f++) {
        const panel = frame(5.0, 2.2, C.tealDim);
        panel.position.copy(feedPos[f]);
        scene.add(panel);
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const o = new THREE.Object3D();
            o.position.set(feedPos[f].x - 2.1 + c * 0.6, feedPos[f].y + 0.62 - r * 0.62, 0.02);
            o.updateMatrix();
            tileBase.push(o);
          }
        }
      }
      for (let i = 0; i < tileBase.length; i++) tiles.setMatrixAt(i, tileBase[i].matrix);
      scene.add(tiles);
      const TARGET_A = 0 * tilesPer + 1 * COLS + 3; // feed A, middle row
      const TARGET_C = 2 * tilesPer + 2 * COLS + 5; // feed C, bottom row
      const tileColor = new THREE.Color();

      // ---- Paths and packets -----------------------------------------------------------
      const curve = (a: InstanceType<typeof THREE.Vector3>, b: InstanceType<typeof THREE.Vector3>, lift: number) =>
        new THREE.QuadraticBezierCurve3(a, new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 + lift, 2.2), b);
      const pPhoneHub = curve(new THREE.Vector3(-9, -1.6, 0.1), new THREE.Vector3(-3.2, 0, 0.1), 1.2);
      const tilePos = (i: number) => tileBase[i].position.clone();
      const pHubA = curve(new THREE.Vector3(-3.2, 0.4, 0.2), tilePos(TARGET_A), 1.8);
      const pHubC = curve(new THREE.Vector3(-3.2, -0.4, 0.2), tilePos(TARGET_C), -1.8);
      const pathLine = (p: InstanceType<typeof THREE.QuadraticBezierCurve3>, color: number) => {
        const g = new THREE.BufferGeometry().setFromPoints(p.getPoints(60));
        const l = new THREE.Line(g, lineMat(color, 0));
        scene.add(l);
        return l;
      };
      const lPhoneHub = pathLine(pPhoneHub, C.coral);
      const lHubA = pathLine(pHubA, C.mint);
      const lHubC = pathLine(pHubC, C.mint);

      const packet = new THREE.Group();
      const packetCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), basic(C.coralHot));
      packet.add(packetCore, glow(0.6, C.coral, 0.45));
      scene.add(packet);

      // particle trail behind the packet
      const TRAIL = 70;
      const trailGeom = new THREE.BufferGeometry();
      const trailPos = new Float32Array(TRAIL * 3);
      trailGeom.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
      const trail = new THREE.Points(trailGeom, new THREE.PointsMaterial({ color: C.coral, size: 0.09, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      scene.add(trail);

      // burst when a post is taken down
      const BURST = 90;
      const burstGeom = new THREE.BufferGeometry();
      const burstPos = new Float32Array(BURST * 3);
      const burstDir = Array.from({ length: BURST }, () => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() * 0.8).normalize());
      burstGeom.setAttribute("position", new THREE.BufferAttribute(burstPos, 3));
      const burst = new THREE.Points(burstGeom, new THREE.PointsMaterial({ color: C.mint, size: 0.08, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      scene.add(burst);

      // removed check ring
      const removedRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 48), basic(C.mint, 0, true));
      scene.add(removedRing);

      // crawler beam: a tall translucent plane sweeping across the feeds
      const beam = new THREE.Group();
      const beamPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 10.4), basic(C.gold, 0.85, true));
      const beamHalo = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 10.4), basic(C.gold, 0.14, true));
      beam.add(beamHalo, beamPlane);
      beam.position.set(3.0, 0, 0.3);
      scene.add(beam);

      // match line from the fingerprint to the re-upload
      const matchGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-9, 0.3, 0.3), new THREE.Vector3(-2, 3.6, 2.4), tilePos(TARGET_C).setZ(0.3)]);
      const matchCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-9, 0.3, 0.3), new THREE.Vector3(-1.5, -4.4, 2.2), tilePos(TARGET_C).setZ(0.3)]);
      matchGeom.setFromPoints(matchCurve.getPoints(80));
      const matchLine = new THREE.Line(matchGeom, new THREE.LineDashedMaterial({ color: C.coral, dashSize: 0.22, gapSize: 0.14, transparent: true, opacity: 0 }));
      matchLine.computeLineDistances();
      scene.add(matchLine);

      // ambient data motes
      const MOTES = 160;
      const moteGeom = new THREE.BufferGeometry();
      const motePos = new Float32Array(MOTES * 3);
      const moteSeed = Array.from({ length: MOTES }, () => [Math.random() * 22 - 11, Math.random() * 10 - 5, Math.random() * 3 - 0.5, Math.random() * 0.4 + 0.1]);
      moteGeom.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
      const motes = new THREE.Points(moteGeom, new THREE.PointsMaterial({ color: C.mint, size: 0.04, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
      scene.add(motes);

      // ---- HUD anchors (projected to screen each frame) -----------------------------
      const hudItems = Array.from(hudEl.querySelectorAll<HTMLElement>("[data-anchor]"));
      const anchors: Record<string, InstanceType<typeof THREE.Vector3>> = {
        device: new THREE.Vector3(-9, -2.75, 0),
        hub: new THREE.Vector3(-3.2, -1.7, 0),
        platforms: new THREE.Vector3(5.6, 4.6, 0),
        scanning: new THREE.Vector3(5.6, -4.65, 0),
        match: tilePos(TARGET_C).add(new THREE.Vector3(0, -0.9, 0)),
        removed: tilePos(TARGET_A).add(new THREE.Vector3(0, -0.85, 0)),
      };
      const projected = new THREE.Vector3();

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // Pull back on narrow screens so the whole scene stays in view.
        const dist = Math.max(19, 37 / camera.aspect);
        camera.position.set(focus.x, focus.y - dist * 0.36, dist);
        camera.lookAt(focus);
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      let running = true;
      let last = performance.now();
      const io = new IntersectionObserver(([entry]) => {
        running = entry.isIntersecting;
        if (running) last = performance.now();
      });
      io.observe(watch);

      // Development only: #flow=<seconds> starts the loop at that moment, for screenshots.
      const devStart = process.env.NODE_ENV !== "production" ? Number(/flow=([\d.]+)/.exec(location.hash)?.[1] ?? 0) : 0;
      let time = devStart % LOOP;
      let raf = 0;
      let shownStep = -1;
      const trailHist: InstanceType<typeof THREE.Vector3>[] = [];

      const setTile = (i: number, color: number, scale = 1, lift = 0) => {
        tileColor.setHex(color);
        tiles.setColorAt(i, tileColor);
        dummy.position.copy(tileBase[i].position);
        dummy.position.z += lift;
        dummy.scale.setScalar(Math.max(0.001, scale));
        dummy.updateMatrix();
        tiles.setMatrixAt(i, dummy.matrix);
      };

      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        if (!running || document.hidden) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        time = (time + dt) % LOOP;
        const t = time;

        // 1. Fingerprint flickers, then settles
        const settled = t > 2.5 && t < 17.2;
        for (let i = 0; i < 256; i++) {
          const on = settled ? BITS[i] : Math.random() < 0.45;
          bitColor.setHex(on ? (settled ? C.mint : C.teal) : 0x0f4a45);
          bits.setColorAt(i, bitColor);
        }
        if (bits.instanceColor) bits.instanceColor.needsUpdate = true;
        (printGlow.material as MeshBasicMaterial).opacity = settled ? 0.16 + 0.06 * Math.sin(t * 4) : 0.1;

        // Hub motion
        const spin = between(t, 3.5, 5.4) || between(t, 12.4, 13.8) ? 2.6 : 0.6;
        core.rotation.x += dt * spin * 0.6;
        core.rotation.y += dt * spin;
        orbits.forEach((o, i) => (o.rotation.z += dt * (0.4 + i * 0.25) * (spin / 0.6) * 0.5));
        (coreGlow.material as MeshBasicMaterial).opacity = 0.2 + 0.1 * Math.sin(t * 3) + (spin > 1 ? 0.15 : 0);

        // Notice sheets assemble, then the signature draws
        sheets.forEach((s, i) => {
          const k = phase(t, 3.5 + i * 0.35, 4.3 + i * 0.35);
          const out = phase(t, 5.2, 5.6);
          s.visible = t > 3.4 && t < 5.7;
          s.position.set(lerp(1.8 - i * 0.2, i * 0.08, k), lerp(3.2, 2.5 + i * 0.05, k), 0.2 + i * 0.05);
          s.scale.setScalar(1 - out * 0.7);
          (s.material as MeshBasicMaterial).opacity = 0.9 * k * (1 - out);
        });
        sig.scale.x = Math.max(0.001, phase(t, 4.6, 5.2));

        // Packets and their paths
        let carrier: InstanceType<typeof THREE.QuadraticBezierCurve3> | null = null;
        let k = 0;
        if (between(t, 1.0, 3.5)) { carrier = pPhoneHub; k = phase(t, 1.0, 3.5); }
        else if (between(t, 5.2, 7.0)) { carrier = pHubA; k = phase(t, 5.2, 7.0); }
        else if (between(t, 12.6, 14.2)) { carrier = pHubC; k = phase(t, 12.6, 14.2); }
        packet.visible = !!carrier;
        if (carrier) {
          const p = carrier.getPoint(k);
          packet.position.copy(p);
          packetCore.rotation.x += dt * 4;
          packetCore.rotation.y += dt * 5;
          trailHist.unshift(p.clone());
        } else {
          trailHist.unshift(packet.position.clone());
        }
        if (trailHist.length > TRAIL) trailHist.length = TRAIL;
        for (let i = 0; i < TRAIL; i++) {
          const p = trailHist[Math.min(i, trailHist.length - 1)] ?? packet.position;
          trailPos[i * 3] = p.x + (Math.random() - 0.5) * 0.06 * i * 0.05;
          trailPos[i * 3 + 1] = p.y + (Math.random() - 0.5) * 0.06 * i * 0.05;
          trailPos[i * 3 + 2] = p.z;
        }
        trailGeom.attributes.position.needsUpdate = true;
        (trail.material as PointsMaterial).opacity = carrier ? 0.8 : Math.max(0, (trail.material as PointsMaterial).opacity - dt * 1.5);
        (lPhoneHub.material as LineBasicMaterial).opacity = between(t, 0.8, 4) ? 0.55 * phase(t, 0.8, 1.4) * (1 - phase(t, 3.5, 4)) : 0;
        (lHubA.material as LineBasicMaterial).opacity = between(t, 5, 7.6) ? 0.55 * phase(t, 5, 5.5) * (1 - phase(t, 7, 7.6)) : 0;
        (lHubC.material as LineBasicMaterial).opacity = between(t, 12.4, 14.8) ? 0.55 * phase(t, 12.4, 12.9) * (1 - phase(t, 14.2, 14.8)) : 0;
        linkBar.visible = t < 1.2 || t > 17.2;

        // Feeds: gentle shimmer, the crawler beam lights tiles as it passes
        const beamOn = between(t, 8.4, 12.6);
        const bx = 3.0 + ((t - 8.4) / 2.1) * 5.4; // two passes across x 3.0 → 8.4
        const beamX = beamOn ? 3.0 + ((bx - 3.0) % 5.4) : -50;
        beam.visible = beamOn;
        beam.position.x = beamX;
        (beamPlane.material as MeshBasicMaterial).opacity = 0.7 + 0.2 * Math.sin(t * 20);

        for (let i = 0; i < tileBase.length; i++) {
          const base = tileBase[i].position;
          const near = beamOn && Math.abs(base.x - beamX) < 0.35;
          const shimmer = 0.5 + 0.5 * Math.sin(t * 1.3 + i * 0.7);
          let color = shimmer > 0.93 ? C.tileLit : C.tile;
          if (near) color = 0x6b6a3c;
          let scale = 1;
          let lift = 0;
          if (i === TARGET_A) {
            if (between(t, 6.6, 7.2)) { color = C.coral; lift = 0.1; }
            else if (t < 6.6 || t > 17.2) color = C.coral;
            else if (between(t, 7.2, 8.0)) { color = C.coral; scale = 1 - phase(t, 7.2, 8.0); }
            else if (t >= 8.0) { color = C.tealDim; scale = 0.001; }
          }
          if (i === TARGET_C) {
            if (between(t, 10.2, 14.2)) { color = between(t, 11.6, 14.2) ? (Math.sin(t * 14) > 0 ? C.coralHot : C.coral) : C.coral; lift = between(t, 11.6, 14.2) ? 0.15 : 0; }
            else if (between(t, 14.2, 15.0)) { color = C.coral; scale = 1 - phase(t, 14.2, 15.0); }
            else if (between(t, 15.0, 17.2)) { scale = 0.001; }
          }
          setTile(i, color, scale, lift);
        }
        tiles.instanceMatrix.needsUpdate = true;
        if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;

        // Bursts and removed rings
        const burstAt = between(t, 7.6, 9.0) ? { p: tilePos(TARGET_A), k: phase(t, 7.6, 9.0) } : between(t, 14.6, 16.0) ? { p: tilePos(TARGET_C), k: phase(t, 14.6, 16.0) } : null;
        (burst.material as PointsMaterial).opacity = burstAt ? 0.9 * (1 - burstAt.k) : 0;
        if (burstAt) {
          for (let i = 0; i < BURST; i++) {
            const d = burstDir[i];
            burstPos[i * 3] = burstAt.p.x + d.x * burstAt.k * 1.6;
            burstPos[i * 3 + 1] = burstAt.p.y + d.y * burstAt.k * 1.6;
            burstPos[i * 3 + 2] = burstAt.p.z + d.z * burstAt.k * 1.2;
          }
          burstGeom.attributes.position.needsUpdate = true;
        }
        const ringAt = between(t, 7.8, 10.2) ? tilePos(TARGET_A) : between(t, 14.8, 17.2) ? tilePos(TARGET_C) : null;
        removedRing.visible = !!ringAt;
        if (ringAt) {
          removedRing.position.copy(ringAt).setZ(0.1);
          const rk = between(t, 7.8, 10.2) ? phase(t, 7.8, 8.4) : phase(t, 14.8, 15.4);
          removedRing.scale.setScalar(0.6 + rk * 0.6);
          (removedRing.material as MeshBasicMaterial).opacity = 0.9 * rk;
        }

        // Match line from the fingerprint to the re-upload
        const matchK = between(t, 11.6, 14.4) ? phase(t, 11.6, 12.2) * (1 - phase(t, 13.9, 14.4)) : 0;
        matchLine.visible = matchK > 0;
        (matchLine.material as Material).opacity = matchK;
        matchGeom.setDrawRange(0, Math.floor(81 * phase(t, 11.6, 12.3)));

        // Ambient motes drift
        for (let i = 0; i < MOTES; i++) {
          const [x, y, z, s] = moteSeed[i];
          motePos[i * 3] = ((x + t * s + 11) % 22) - 11;
          motePos[i * 3 + 1] = y + Math.sin(t * s * 2 + i) * 0.15;
          motePos[i * 3 + 2] = z;
        }
        moteGeom.attributes.position.needsUpdate = true;

        // HUD: project anchors, show labels per phase
        const vis: Record<string, boolean> = {
          device: t > 0.3 && t < 17.4,
          hub: between(t, 3.4, 6.0) || between(t, 12.4, 14.2),
          platforms: between(t, 5.0, 17.4),
          scanning: between(t, 8.4, 12.6),
          match: between(t, 11.9, 14.2),
          removed: between(t, 8.0, 10.2) || between(t, 15.0, 17.2),
        };
        const w = el.clientWidth;
        const h = el.clientHeight;
        for (const item of hudItems) {
          const key = item.dataset.anchor as string;
          let a = anchors[key];
          if (key === "removed" && between(t, 15.0, 17.2)) a = tilePos(TARGET_C).add(new THREE.Vector3(0, 0.85, 0));
          projected.copy(a).project(camera);
          // Keep each label fully inside the stage, even when its anchor sits near an edge.
          const half = item.offsetWidth / 2 + 6;
          const x = Math.min(w - half, Math.max(half, (projected.x * 0.5 + 0.5) * w));
          const y = Math.min(h - 16, Math.max(16, (-projected.y * 0.5 + 0.5) * h));
          item.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
          item.classList.toggle("is-on", !!vis[key]);
        }

        let step = 0;
        for (let i = 0; i < STEP_TIMES.length; i++) if (t >= STEP_TIMES[i]) step = i;
        if (step !== shownStep) {
          shownStep = step;
          setActive(step);
        }

        renderer.render(scene, camera);
      };
      const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
      raf = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        scene.traverse((obj) => {
          const m = obj as Mesh | Points | InstancedMesh;
          (m as { geometry?: BufferGeometry }).geometry?.dispose?.();
          const material = (m as { material?: Material | Material[] }).material;
          if (Array.isArray(material)) material.forEach((x) => x.dispose());
          else material?.dispose?.();
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    };

    const lazy = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          lazy.disconnect();
          void start();
        }
      },
      { rootMargin: "200px" },
    );
    lazy.observe(watch);

    return () => {
      disposed = true;
      lazy.disconnect();
      cleanup?.();
    };
  }, []);

  return (
    <figure ref={figure} className="notice-flow">
      <div ref={host} className={`notice-flow-stage tech ${animated ? "is-animated" : ""}`} aria-hidden="true">
        <div ref={hud} className="flow-hud">
          <span data-anchor="device">{labels.device}</span>
          <span data-anchor="hub">{labels.hub}</span>
          <span data-anchor="platforms">{labels.platforms}</span>
          <span data-anchor="scanning" className="is-gold">{labels.scanning}</span>
          <span data-anchor="match" className="is-coral">{labels.match}</span>
          <span data-anchor="removed" className="is-mint">{labels.removed}</span>
        </div>
      </div>
      <figcaption className="sr-only">{label}</figcaption>
      <ol className="notice-flow-steps">
        {steps.map((step, i) => (
          <li key={step.title} className={animated && active === i ? "is-active" : undefined} aria-current={animated && active === i ? "step" : undefined}>
            <span className="notice-flow-num">{i + 1}</span>
            <span>
              <strong>{step.title}</strong>
              <span className="notice-flow-body">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
