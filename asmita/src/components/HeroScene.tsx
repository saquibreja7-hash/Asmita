"use client";

import { useEffect, useRef } from "react";

/*
 * Vector hero scene. Pure SVG drawn in the site's own vocabulary: 1px Ash
 * hairlines, pill nodes in mono, one gradient poppy built from bezier petals,
 * and soft pastel washes. Motion is CSS keyframes; the pointer only eases two
 * custom properties that drive a layered parallax. Still under reduced motion.
 */

const PETALS = 6;
const INNER = 5;

function petalPath(len: number, width: number) {
  return `M0 0 C ${-width} ${-len * 0.25}, ${-width * 1.15} ${-len * 0.78}, 0 ${-len} C ${width * 1.15} ${-len * 0.78}, ${width} ${-len * 0.25}, 0 0 Z`;
}

const particles = Array.from({ length: 14 }, (_, i) => ({
  x: 120 + ((i * 137) % 560),
  r: 1.5 + (i % 3),
  delay: (i * 1.7) % 12,
  dur: 14 + (i % 5) * 2,
  tone: i % 3,
}));

export function HeroScene() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;

    const tick = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      el.style.setProperty("--px", cx.toFixed(4));
      el.style.setProperty("--py", cy.toFixed(4));
      raf =
        Math.abs(tx - cx) > 0.0005 || Math.abs(ty - cy) > 0.0005
          ? requestAnimationFrame(tick)
          : 0;
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      start();
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      start();
    };

    const host = el.closest("section") ?? el;
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className="scene" aria-hidden>
      <svg viewBox="0 0 800 800" className="scene-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="washA" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a0b5eb" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#a7fccd" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#a7fccd" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="washB" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff9473" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#ecda98" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ecda98" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="petal" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ff9473" stopOpacity="0.7" />
            <stop offset="55%" stopColor="#ffb79a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ecda98" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="petalInner" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ff9473" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fff2d6" stopOpacity="0.85" />
          </linearGradient>
          <radialGradient id="core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff7e0" stopOpacity="1" />
            <stop offset="45%" stopColor="#ecda98" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ff9473" stopOpacity="0" />
          </radialGradient>
          <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="28" />
          </filter>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        {/* Atmospheric washes, deepest parallax layer */}
        <g className="layer" style={{ "--d": 0.4 } as React.CSSProperties}>
          <circle className="wash-a" cx="560" cy="330" r="260" fill="url(#washA)" filter="url(#soft)" />
          <circle className="wash-b" cx="250" cy="560" r="230" fill="url(#washB)" filter="url(#soft)" />
        </g>

        {/* Orbit rings */}
        <g className="layer" style={{ "--d": 0.7 } as React.CSSProperties} fill="none" stroke="#cecac8" strokeWidth="1">
          <circle cx="400" cy="440" r="150" opacity="0.9" />
          <circle cx="400" cy="440" r="230" opacity="0.75" />
          <circle cx="400" cy="440" r="310" opacity="0.55" strokeDasharray="2 10" className="ring-dash" />
          <circle cx="400" cy="440" r="390" opacity="0.35" />
          {/* horizon */}
          <path d="M-40 640 H840" opacity="0.6" />
        </g>

        {/* Travelling dots on the rings */}
        <g className="layer" style={{ "--d": 0.7 } as React.CSSProperties}>
          <g className="orbit orbit-1">
            <circle cx="400" cy="210" r="4" fill="#242424" />
          </g>
          <g className="orbit orbit-2">
            <circle cx="400" cy="130" r="3" fill="#242424" opacity="0.7" />
            <circle cx="400" cy="130" r="9" fill="none" stroke="#242424" strokeWidth="1" opacity="0.35" />
          </g>
        </g>

        {/* Rising particles */}
        <g className="layer" style={{ "--d": 1.1 } as React.CSSProperties}>
          {particles.map((p, i) => (
            <circle
              key={i}
              className="particle"
              cx={p.x}
              cy="720"
              r={p.r}
              fill={p.tone === 0 ? "#ff9473" : p.tone === 1 ? "#a0b5eb" : "#ecda98"}
              style={{ animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}
            />
          ))}
        </g>

        {/* Poppy */}
        <g className="layer" style={{ "--d": 1 } as React.CSSProperties}>
          <g className="sway">
            {/* stem */}
            <path
              d="M400 470 C 404 560, 372 640, 386 800"
              fill="none"
              stroke="#242424"
              strokeWidth="1.25"
              opacity="0.7"
            />
            {/* leaf */}
            <path
              d="M390 600 C 340 590, 310 620, 300 660 C 340 655, 380 640, 390 600 Z"
              fill="none"
              stroke="#242424"
              strokeWidth="1"
              opacity="0.45"
            />
            <path d="M390 600 C 360 620, 335 640, 305 656" fill="none" stroke="#242424" strokeWidth="0.75" opacity="0.35" />

            <g className="head">
              {/* glow behind the bloom */}
              <circle className="bloom-glow" cx="400" cy="440" r="120" fill="url(#core)" filter="url(#glow)" />

              {/* outer petals */}
              {Array.from({ length: PETALS }).map((_, i) => (
                <g key={`o${i}`} transform={`translate(400 440) rotate(${(360 / PETALS) * i})`}>
                  <path
                    className="petal"
                    d={petalPath(150, 62)}
                    fill="url(#petal)"
                    stroke="#242424"
                    strokeOpacity="0.28"
                    strokeWidth="0.75"
                    style={{ animationDelay: `${i * 0.35}s` }}
                  />
                </g>
              ))}
              {/* inner petals */}
              {Array.from({ length: INNER }).map((_, i) => (
                <g key={`i${i}`} transform={`translate(400 440) rotate(${(360 / INNER) * i + 36})`}>
                  <path
                    className="petal petal-inner"
                    d={petalPath(92, 40)}
                    fill="url(#petalInner)"
                    stroke="#242424"
                    strokeOpacity="0.2"
                    strokeWidth="0.6"
                    style={{ animationDelay: `${i * 0.5 + 0.2}s` }}
                  />
                </g>
              ))}
              {/* core and stamens */}
              <circle cx="400" cy="440" r="16" fill="#242424" />
              {Array.from({ length: 12 }).map((_, i) => {
                const a = (Math.PI * 2 * i) / 12;
                return (
                  <circle
                    key={`s${i}`}
                    cx={(400 + Math.cos(a) * 26).toFixed(2)}
                    cy={(440 + Math.sin(a) * 26).toFixed(2)}
                    r="2.2"
                    fill="#a7fccd"
                    className="stamen"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                );
              })}
            </g>
          </g>
        </g>

        {/* Node pills riding the outer ring */}
        <g className="layer" style={{ "--d": 0.85 } as React.CSSProperties}>
          {[
            { label: "LINKS AS TEXT", w: 116, dark: false, delay: "0s" },
            { label: "NOTICE", w: 100, dark: true, delay: "-14s" },
            { label: "64-CHAR HASH", w: 124, dark: false, delay: "-28s" },
          ].map((n) => (
            <g key={n.label} className="orbit orbit-3" style={{ animationDelay: n.delay }}>
              <g transform="translate(400 50)">
                <g className="upright" style={{ animationDelay: n.delay }}>
                  <rect
                    x={-n.w / 2}
                    y="-16"
                    width={n.w}
                    height="32"
                    rx="16"
                    fill={n.dark ? "#242424" : "#f6f3f1"}
                    stroke={n.dark ? "#242424" : "#cecac8"}
                  />
                  <text
                    className={`node-text ${n.dark ? "node-text-light" : ""}`}
                    textAnchor="middle"
                    y="4"
                  >
                    {n.label}
                  </text>
                </g>
              </g>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
