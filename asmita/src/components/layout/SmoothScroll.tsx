"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

// Site-wide smooth scrolling (Lenis). Off for anyone who asks for reduced
// motion, and on touch devices, where native scrolling is better.
// Anchor links (#reach, the skip link) still jump and move focus as before.
export function SmoothScroll() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;

    const lenis = new Lenis({ autoRaf: true, anchors: { offset: -80 }, syncTouch: false, allowNestedScroll: true });
    const stop = () => lenis.destroy();
    reduce.addEventListener("change", stop, { once: true });
    return () => {
      reduce.removeEventListener("change", stop);
      lenis.destroy();
    };
  }, []);
  return null;
}
