/**
 * LifeXP 3D Logo Mark
 * A hand-crafted SVG of a 3D-extruded lightning bolt in pure black & white.
 * Uses isometric-style extrusion with three visible face depths.
 */

interface LifeXPLogoProps {
  size?: number;
  /** Show the containing badge square (default: true) */
  badge?: boolean;
}

export default function LifeXPLogo({ size = 28, badge = true }: LifeXPLogoProps) {
  // ── Front-face vertices of the lightning bolt (100×100 viewBox) ──────────
  // The bolt points from upper-right to lower-left (classic ⚡ direction)
  const F = {
    A: [26, 4],   // top-left of upper arm
    B: [60, 4],   // top-right of upper arm
    C: [42, 42],  // inner elbow right
    D: [68, 42],  // outer right of lower arm
    E: [30, 90],  // tip bottom
    F: [44, 60],  // inner elbow left (lower)
    G: [14, 60],  // outer left of lower arm
  };

  // ── Extrusion vector (toward lower-right = "light from upper-left") ──────
  const dx = 10, dy = 7;

  // Back-face vertices (front + offset)
  const B_ = Object.fromEntries(
    Object.entries(F).map(([k, [x, y]]) => [k, [x + dx, y + dy]])
  ) as typeof F;

  // Helper: array of [x,y] points → SVG "points" attribute string
  const pts = (...coords: number[][]) =>
    coords.map(([x, y]) => `${x},${y}`).join(" ");

  // Helper: array of [x,y] → SVG path string
  const path = (...coords: number[][]) =>
    `M ${coords.map(([x, y]) => `${x} ${y}`).join(" L ")} Z`;

  // ── Three visible side faces ─────────────────────────────────────────────
  // Upper-arm right face  (B → B' → C' → C)
  const face1 = pts(F.B, B_.B, B_.C, F.C);
  // Lower-arm right face  (D → D' → E' → E)
  const face2 = pts(F.D, B_.D, B_.E, F.E);
  // Tip underside face    (E → E' → F' → F)
  const face3 = pts(F.E, B_.E, B_.F, F.F);

  // Front-face path
  const frontPath = path(F.A, F.B, F.C, F.D, F.E, F.F, F.G);

  // ── Gradient IDs ─────────────────────────────────────────────────────────
  const gradId   = "lxp-bolt-grad";
  const shineId  = "lxp-bolt-shine";

  const logo = (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        {/* Front-face gradient: bright white top → soft gray bottom */}
        <linearGradient id={gradId} x1="40%" y1="0%" x2="60%" y2="100%">
          <stop offset="0%"   stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#C8C8C8" />
        </linearGradient>
        {/* Top-edge shine strip */}
        <linearGradient id={shineId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ── Badge background ──────────────────────────────────────────── */}
      {badge && (
        <>
          {/* Outer glow shadow */}
          <rect x="4" y="4" width="92" height="92" rx="20"
            fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
          {/* Dark face */}
          <rect x="2" y="2" width="96" height="96" rx="18"
            fill="#0d0d0d" />
          {/* Inner bevel top highlight */}
          <rect x="2" y="2" width="96" height="12" rx="18"
            fill="rgba(255,255,255,0.04)" />
        </>
      )}

      {/* ── 3-D extrusion — draw back → sides → front ────────────────── */}

      {/* 1. Back-face silhouette (darkest — forms the extrusion mass) */}
      <path
        d={path(B_.A, B_.B, B_.C, B_.D, B_.E, B_.F, B_.G)}
        fill="#111"
      />

      {/* 2. Side face: upper-arm right — medium-dark gray */}
      <polygon
        points={face1}
        fill="#4a4a4a"
        stroke="#000"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* 3. Side face: lower-arm right — darker gray */}
      <polygon
        points={face2}
        fill="#2e2e2e"
        stroke="#000"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* 4. Side face: tip underside — near black */}
      <polygon
        points={face3}
        fill="#1a1a1a"
        stroke="#000"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* 5. Front face — white gradient */}
      <path
        d={frontPath}
        fill={`url(#${gradId})`}
        stroke="#000"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      {/* 6. Surface shine — thin strip along top edge of front face */}
      <path
        d={`M ${F.A[0]} ${F.A[1]} L ${F.B[0]} ${F.B[1]} L ${F.B[0] - 2} ${F.B[1] + 8} L ${F.A[0] + 2} ${F.A[1] + 8} Z`}
        fill={`url(#${shineId})`}
      />

      {/* 7. Edge crease line across the inner elbow */}
      <line
        x1={F.G[0]} y1={F.G[1]}
        x2={F.D[0]} y2={F.D[1]}
        stroke="rgba(0,0,0,0.18)"
        strokeWidth="1.2"
      />
    </svg>
  );

  return logo;
}
