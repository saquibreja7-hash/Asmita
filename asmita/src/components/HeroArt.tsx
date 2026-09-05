"use client";

import { useEffect, useRef } from "react";

/*
 * Animated hero art. The flower breathes on its own; the whole scene tilts,
 * the mist drifts, and a warm halo follows the pointer. Everything is CSS
 * driven from four custom properties, so the only JS is a pointer listener.
 * Honors prefers-reduced-motion by leaving the scene still.
 */
export function HeroArt() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let tx = 0.5;
    let ty = 0.5;
    let cx = 0.5;
    let cy = 0.5;
    let active = false;

    const tick = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      el.style.setProperty("--mx", cx.toFixed(4));
      el.style.setProperty("--my", cy.toFixed(4));
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001 || active) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };

    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      ty = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      active = true;
      el.dataset.hover = "true";
      start();
    };

    const onLeave = () => {
      tx = 0.5;
      ty = 0.5;
      active = false;
      delete el.dataset.hover;
      start();
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className="hero-art" aria-hidden>
      <div className="hero-art-scene">
        <picture>
          <source media="(max-width: 720px)" srcSet="/images/hero-art-sm.webp" />
          <img
            src="/images/hero-art.webp"
            alt=""
            width={1920}
            height={1080}
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <span className="hero-art-mist hero-art-mist-a" />
        <span className="hero-art-mist hero-art-mist-b" />
        <span className="hero-art-bloom" />
        <span className="hero-art-halo" />
        <span className="hero-art-sheen" />
      </div>
    </div>
  );
}
