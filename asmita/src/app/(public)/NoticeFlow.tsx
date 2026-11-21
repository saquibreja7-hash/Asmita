"use client";

import { useEffect, useRef, useState } from "react";
import type { LineDashedMaterial, Material, Mesh, MeshBasicMaterial } from "three";

// A looping Three.js scene: a link leaves the phone, becomes a signed notice,
// travels to the platform and the content comes down; then the crawler sweeps
// the platform, catches a re-upload that matches the fingerprint, and it comes
// down again. The canvas is decorative (aria-hidden); the numbered steps under
// it say the same thing and highlight in time. Three.js loads only when the
// section is on screen, never under prefers-reduced-motion, and never on a
// device without WebGL: those visitors get the steps alone.

export type FlowStep = { title: string; body: string };

const LOOP = 14; // seconds
const STEP_TIMES = [0, 2, 3.6, 6.3, 9.5, 11]; // when each caption becomes active

const COLORS = {
  teal: 0x0a5e5a,
  tealSoft: 0xd4e9e6,
  tealMid: 0x6fb3ab,
  coral: 0xff9473,
  coralInk: 0xb4461f,
  gold: 0xecda98,
  line: 0xd9d6d3,
  ink: 0x242424,
  white: 0xffffff,
  tile: 0xf1efed,
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const phase = (t: number, a: number, b: number) => ease((t - a) / (b - a));

export function NoticeFlow({ steps, label }: { steps: FlowStep[]; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  // The stage is hidden until Three.js is running, so visibility is watched on the figure.
  const figure = useRef<HTMLElement>(null);
  const [active, setActive] = useState(-1);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const el = host.current;
    const watch = figure.current;
    if (!el || !watch) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const probe = document.createElement("canvas");
    if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    const start = async () => {
      const THREE = await import("three");
      if (disposed) return;
      setAnimated(true);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-8, 8, 4, -4, 0.1, 100);
      camera.position.set(0, -6, 12);
      camera.lookAt(0, 0.4, 0);

      const mat = (color: number, opacity = 1) =>
        new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
      const box = (w: number, h: number, d: number, color: number, opacity = 1) =>
        new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opacity));
      const outline = (mesh: Mesh, color: number) => {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color }));
        mesh.add(edges);
        return mesh;
      };

      // Ground: a faint grid so the pieces sit on something.
      const grid = new THREE.GridHelper(20, 20, COLORS.line, COLORS.line);
      grid.rotation.x = Math.PI / 2;
      grid.position.z = -0.3;
      (grid.material as Material).transparent = true;
      (grid.material as Material).opacity = 0.35;
      scene.add(grid);

      // Phone
      const phone = outline(box(1.5, 2.8, 0.25, COLORS.tealSoft), COLORS.teal);
      phone.position.set(-6, 0, 0);
      scene.add(phone);
      const screen = box(1.2, 2.2, 0.02, COLORS.white);
      screen.position.set(0, 0.05, 0.14);
      phone.add(screen);

      // The link chip
      const chip = box(0.9, 0.26, 0.12, COLORS.coral);
      scene.add(chip);

      // The notice
      const notice = outline(box(1.9, 2.5, 0.08, COLORS.white), COLORS.teal);
      notice.position.set(-1.6, 0, 0);
      scene.add(notice);
      for (let i = 0; i < 4; i++) {
        const row = box(i === 0 ? 1.0 : 1.3, 0.09, 0.02, i === 0 ? COLORS.teal : COLORS.line);
        row.position.set(i === 0 ? -0.15 : 0, 0.8 - i * 0.32, 0.06);
        notice.add(row);
      }
      const signature = box(1.1, 0.07, 0.02, COLORS.coralInk);
      signature.position.set(0, -0.8, 0.06);
      notice.add(signature);

      // The envelope
      const envelope = outline(box(0.95, 0.62, 0.1, COLORS.teal), COLORS.teal);
      scene.add(envelope);

      // The platform: a 3x3 wall of posts
      const platform = outline(box(3.4, 3.4, 0.12, COLORS.white), COLORS.line);
      platform.position.set(4.6, 0, 0);
      scene.add(platform);
      const tiles: Mesh[] = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const tile = box(0.9, 0.9, 0.1, COLORS.tile);
          tile.position.set(-1.05 + c * 1.05, 1.05 - r * 1.05, 0.1);
          platform.add(tile);
          tiles.push(tile);
        }
      }
      const tileMat = (i: number) => tiles[i].material as MeshBasicMaterial;

      // The fingerprint (matched in phase two)
      const print = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.18 + i * 0.16, 0.24 + i * 0.16, 40), mat(COLORS.coral));
        print.add(ring);
      }
      print.position.set(0.9, 2.55, 0.2);
      scene.add(print);

      // The crawler's sweep over the platform
      const sweep = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48, 0, Math.PI / 5), mat(COLORS.gold, 0.45));
      sweep.position.set(4.6, 0, 0.25);
      scene.add(sweep);

      // The match line from the re-upload to the fingerprint
      const matchGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.9, 2.55, 0.2), new THREE.Vector3(4.6, -1.05, 0.3)]);
      const matchLine = new THREE.Line(matchGeom, new THREE.LineDashedMaterial({ color: COLORS.coralInk, dashSize: 0.18, gapSize: 0.12, transparent: true }));
      matchLine.computeLineDistances();
      scene.add(matchLine);

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        const aspect = w / h;
        // Keep the whole scene (about 15 units wide) in view on narrow screens.
        const halfH = Math.max(3.3, 7.6 / aspect);
        camera.left = -halfH * aspect;
        camera.right = halfH * aspect;
        camera.top = halfH;
        camera.bottom = -halfH;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      let running = true;
      const io = new IntersectionObserver(([entry]) => {
        running = entry.isIntersecting;
        if (running) last = performance.now();
      });
      io.observe(watch);

      let last = performance.now();
      // Development only: #flow=<seconds> starts the loop at that moment, for screenshots.
      const devStart = process.env.NODE_ENV !== "production" ? Number(/flow=([\d.]+)/.exec(location.hash)?.[1] ?? 0) : 0;
      let time = devStart % LOOP;
      let raf = 0;
      let shownStep = -1;
      const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        if (!running || document.hidden) return;
        time = (time + Math.min(0.05, (now - last) / 1000)) % LOOP;
        last = now;
        const t = time;

        // Phase one: link → notice → signed → sent → removed
        const toNotice = phase(t, 0.5, 2);
        chip.visible = t < 2.1;
        chip.position.set(lerp(-6, -1.6, toNotice), lerp(0.4, 0.2, toNotice), lerp(0.3, 1.0, Math.sin(toNotice * Math.PI) * 1));
        signature.scale.x = Math.max(0.001, phase(t, 2.3, 3.3));
        const send = phase(t, 3.6, 5.0);
        envelope.visible = t > 3.5 && t < 5.1;
        envelope.position.set(lerp(-1.6, 4.6, send), 0, 0.4 + Math.sin(send * Math.PI) * 1.6);
        envelope.rotation.z = Math.sin(send * Math.PI) * 0.25;

        // The content tile: coral until removed, then teal (taken down)
        const down1 = phase(t, 5.0, 6.0);
        tiles[4].scale.setScalar(t < 5 ? 1 : Math.max(0.001, t < 6 ? 1 - down1 * 0.6 : 0.4 + phase(t, 6, 6.4) * 0.6));
        tileMat(4).color.setHex(t < 5.6 ? COLORS.coral : COLORS.tealMid);

        // Phase two: new uploads arrive, the crawler sweeps, a re-upload matches
        for (const i of [0, 2, 6, 8]) {
          const k = phase(t, 6.6 + i * 0.12, 7.2 + i * 0.12);
          tileMat(i).color.setHex(k > 0.5 && t < 13.4 ? COLORS.tealSoft : COLORS.tile);
        }
        const reup = t > 8 && t < 11.6;
        const hit = t > 9.5 && t < 11.6;
        tileMat(7).color.setHex(t > 11.6 && t < 13.4 ? COLORS.tealMid : reup ? COLORS.coral : COLORS.tile);
        tiles[7].scale.setScalar(hit ? 1 + Math.sin((t - 9.5) * 10) * 0.06 : t > 11 && t < 11.6 ? 1 - phase(t, 11, 11.6) * 0.6 : 1);
        sweep.visible = t > 6.3 && t < 12.6;
        sweep.rotation.z = (t - 6.3) * 1.6;
        (sweep.material as MeshBasicMaterial).opacity = 0.35 + 0.15 * Math.sin(t * 3);
        print.visible = t > 9.3 && t < 12.8;
        print.scale.setScalar(0.6 + phase(t, 9.3, 9.8) * 0.4);
        matchLine.visible = t > 9.6 && t < 11.2;
        (matchLine.material as LineDashedMaterial).opacity = phase(t, 9.6, 10.0);

        // Reset at the end of the loop
        if (t > 13.4) {
          tileMat(4).color.setHex(COLORS.coral);
          tiles[4].scale.setScalar(1);
          signature.scale.x = 0.001;
        }

        let step = 0;
        for (let i = 0; i < STEP_TIMES.length; i++) if (t >= STEP_TIMES[i]) step = i;
        if (step !== shownStep) {
          shownStep = step;
          setActive(step);
        }

        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(frame);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        scene.traverse((obj) => {
          const m = obj as Mesh;
          m.geometry?.dispose?.();
          const material = m.material as Material | Material[] | undefined;
          if (Array.isArray(material)) material.forEach((x) => x.dispose());
          else material?.dispose?.();
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    };

    // Load Three.js only once the section is near the screen.
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
      <div ref={host} className={`notice-flow-stage ${animated ? "is-animated" : ""}`} aria-hidden="true" />
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
