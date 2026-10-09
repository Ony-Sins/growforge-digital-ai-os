/**
 * The Mission Core's glass bubble (C8): a transparent, icy-cyan glass sphere with luminous edge highlights, soft internal holographic flow ribbons, dotted orbit trails, a few drifting light nodes and two small glass beads,
 * as in the approved reference image (without its outer rings or surface). Pure decoration: one inline SVG, gradients only (no blur, no filter), animated by CSS transforms / opacity only (slow side-to-side yaw, drifting
 * trails, a restrained breathing edge). It is part of the persistent chassis (never cloned, never faded by a mission switch) and the mission's text is laid over it by the Core node.
 */
import styles from "./MissionCoreGlass.module.css";

export function MissionCoreGlass() {
  return <svg className={styles.glass} viewBox="0 0 200 200" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="mcBody" cx=".5" cy=".47" r=".54">
        <stop offset="0" stopColor="#0c3441" stopOpacity=".34" /><stop offset=".5" stopColor="#0a2f3b" stopOpacity=".26" />
        <stop offset=".78" stopColor="#3fb6cc" stopOpacity=".16" /><stop offset=".91" stopColor="#a9eef9" stopOpacity=".34" /><stop offset=".97" stopColor="#e6fdff" stopOpacity=".62" /><stop offset="1" stopColor="#ffffff" stopOpacity=".78" />
      </radialGradient>
      <linearGradient id="mcRim" gradientUnits="userSpaceOnUse" x1="22" y1="22" x2="178" y2="178">
        <stop offset="0" stopColor="#ffffff" stopOpacity=".95" /><stop offset=".32" stopColor="#a6ecf7" stopOpacity=".5" /><stop offset=".55" stopColor="#62cbde" stopOpacity=".3" />
        <stop offset=".8" stopColor="#c8f6fc" stopOpacity=".65" /><stop offset="1" stopColor="#ffffff" stopOpacity=".95" />
      </linearGradient>
      <linearGradient id="mcHi" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity=".92" /><stop offset=".6" stopColor="#d4f8fd" stopOpacity=".4" /><stop offset="1" stopColor="#d4f8fd" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="mcHiSoft" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e9fcff" stopOpacity=".55" /><stop offset="1" stopColor="#e9fcff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="mcRibbon" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#9eeaf6" stopOpacity="0" /><stop offset=".3" stopColor="#e4fcff" stopOpacity=".72" /><stop offset=".7" stopColor="#8fe6f4" stopOpacity=".55" /><stop offset="1" stopColor="#9eeaf6" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="mcBand" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#bff3fb" stopOpacity="0" /><stop offset=".45" stopColor="#bff3fb" stopOpacity=".26" /><stop offset="1" stopColor="#bff3fb" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="mcNode"><stop offset="0" stopColor="#ffffff" stopOpacity=".95" /><stop offset=".25" stopColor="#bff3fb" stopOpacity=".55" /><stop offset="1" stopColor="#7fe3f2" stopOpacity="0" /></radialGradient>
      <radialGradient id="mcBead" cx=".36" cy=".32" r=".7"><stop offset="0" stopColor="#ffffff" stopOpacity=".95" /><stop offset=".45" stopColor="#bff3fb" stopOpacity=".55" /><stop offset="1" stopColor="#4fb7cd" stopOpacity=".5" /></radialGradient>
      <radialGradient id="mcPlate"><stop offset="0" stopColor="#02141c" stopOpacity=".8" /><stop offset=".6" stopColor="#03161e" stopOpacity=".5" /><stop offset="1" stopColor="#03161e" stopOpacity="0" /></radialGradient>
      <linearGradient id="mcPrism" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ff9ad8" stopOpacity="0" /><stop offset=".4" stopColor="#ffd98a" stopOpacity=".2" /><stop offset=".7" stopColor="#8fe6f4" stopOpacity=".22" /><stop offset="1" stopColor="#9a8cff" stopOpacity="0" />
      </linearGradient>
    </defs>

    {/* glass body: a dark translucent core brightening to a luminous edge */}
    <circle cx="100" cy="100" r="98" fill="url(#mcBody)" />
    <ellipse cx="140" cy="62" rx="27" ry="35" transform="rotate(24 140 62)" fill="#01111a" fillOpacity=".3" stroke="#d6f8ff" strokeOpacity=".22" strokeWidth=".8" />

    {/* internal holographic flow: drifting ribbons, dotted orbit trails, light nodes (counter-parallax to the edge) */}
    <g className={styles.inner}>
      <g className={styles.tilt} transform="rotate(-18)"><g className={styles.flowA}>
        <path d="M26 108C54 42 142 34 180 94C142 64 66 74 26 108Z" fill="url(#mcBand)" stroke="url(#mcRibbon)" strokeWidth="1.3" />
        <path d="M32 116C70 82 138 84 174 108" fill="none" stroke="url(#mcRibbon)" strokeWidth=".7" />
      </g></g>
      <g className={styles.tilt} transform="rotate(34)"><g className={styles.flowB}>
        <path d="M22 96C52 150 146 160 184 104C146 134 68 128 22 96Z" fill="url(#mcBand)" stroke="url(#mcRibbon)" strokeWidth="1" />
        <path d="M30 90C74 126 140 122 178 98" fill="none" stroke="url(#mcRibbon)" strokeWidth=".7" />
      </g></g>
      <g className={styles.tilt} transform="rotate(-62)"><g className={styles.flowC}>
        <path d="M34 100C56 56 140 54 170 100C138 80 70 82 34 100Z" fill="url(#mcBand)" stroke="url(#mcRibbon)" strokeWidth=".9" />
      </g></g>

      <g className={styles.tilt} transform="rotate(-12)"><g className={styles.orbitA}>
        <ellipse cx="100" cy="100" rx="76" ry="48" fill="none" stroke="#c4f5fb" strokeOpacity=".5" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="0.1 5.2" />
        <circle cx="176" cy="100" r="6" fill="url(#mcNode)" /><circle cx="176" cy="100" r="1.5" fill="#fff" />
        <circle cx="24" cy="100" r="4.5" fill="url(#mcNode)" className={styles.twinkle} /><circle cx="24" cy="100" r="1.1" fill="#fff" />
      </g></g>
      <g className={styles.tilt} transform="rotate(48)"><g className={styles.orbitB}>
        <ellipse cx="100" cy="100" rx="64" ry="84" fill="none" stroke="#c4f5fb" strokeOpacity=".4" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="0.1 5.6" />
        <circle cx="100" cy="16" r="5" fill="url(#mcNode)" className={styles.twinkle2} /><circle cx="100" cy="16" r="1.3" fill="#fff" />
        <circle cx="100" cy="184" r="3.6" fill="url(#mcNode)" /><circle cx="100" cy="184" r="1" fill="#fff" />
      </g></g>
      <g className={styles.tilt} transform="rotate(-30)"><g className={styles.orbitC}>
        <ellipse cx="100" cy="100" rx="86" ry="30" fill="none" stroke="#c4f5fb" strokeOpacity=".3" strokeWidth="1" strokeLinecap="round" strokeDasharray="0.1 6" />
        <circle cx="186" cy="100" r="4.2" fill="url(#mcBead)" stroke="#e8fdff" strokeOpacity=".7" strokeWidth=".6" />
      </g></g>
      <g className={styles.tilt} transform="rotate(20)"><g className={styles.orbitD}>
        <circle cx="52" cy="100" r="4" fill="url(#mcBead)" stroke="#e8fdff" strokeOpacity=".7" strokeWidth=".6" />
      </g></g>

      <g className={styles.twinkle2}><circle cx="134.9" cy="143.7" r="0.89" fill="#e9fdff" fillOpacity="0.38" /><circle cx="52.7" cy="147.9" r="0.53" fill="#e9fdff" fillOpacity="0.55" /><circle cx="69.3" cy="112.2" r="0.54" fill="#e9fdff" fillOpacity="0.39" /><circle cx="130.5" cy="47.7" r="0.57" fill="#e9fdff" fillOpacity="0.44" /><circle cx="171.4" cy="78.1" r="0.85" fill="#e9fdff" fillOpacity="0.51" /><circle cx="185.4" cy="123.2" r="1.02" fill="#e9fdff" fillOpacity="0.47" /><circle cx="134.4" cy="128.3" r="0.69" fill="#e9fdff" fillOpacity="0.68" /><circle cx="56.6" cy="78.0" r="0.88" fill="#e9fdff" fillOpacity="0.5" /><circle cx="166.3" cy="124.8" r="0.54" fill="#e9fdff" fillOpacity="0.43" /><circle cx="30.2" cy="130.7" r="0.69" fill="#e9fdff" fillOpacity="0.58" /><circle cx="79.4" cy="157.5" r="0.98" fill="#e9fdff" fillOpacity="0.63" /></g>
      <g className={styles.twinkle}><circle cx="51.3" cy="77.9" r="0.82" fill="#e9fdff" fillOpacity="0.7" /><circle cx="81.2" cy="169.8" r="1.09" fill="#e9fdff" fillOpacity="0.4" /><circle cx="102.9" cy="41.3" r="0.59" fill="#e9fdff" fillOpacity="0.55" /><circle cx="83.4" cy="73.5" r="0.96" fill="#e9fdff" fillOpacity="0.58" /><circle cx="66.7" cy="170.9" r="0.92" fill="#e9fdff" fillOpacity="0.59" /><circle cx="29.5" cy="117.9" r="1.0" fill="#e9fdff" fillOpacity="0.73" /><circle cx="65.0" cy="47.3" r="0.54" fill="#e9fdff" fillOpacity="0.63" /><circle cx="176.2" cy="97.0" r="0.99" fill="#e9fdff" fillOpacity="0.46" /><circle cx="68.9" cy="50.2" r="0.51" fill="#e9fdff" fillOpacity="0.53" /><circle cx="136.1" cy="129.4" r="0.54" fill="#e9fdff" fillOpacity="0.66" /><circle cx="100.7" cy="140.7" r="0.73" fill="#e9fdff" fillOpacity="0.7" /></g>
      {/* a few still light nodes with a gentle sparkle */}
      <g className={styles.twinkle}>
        <circle cx="64" cy="70" r="5.4" fill="url(#mcNode)" /><path d="M64 56V84M50 70H78" stroke="#f2feff" strokeOpacity=".8" strokeWidth=".6" />
        <circle cx="132" cy="132" r="4.4" fill="url(#mcNode)" />
      </g>
      <g className={styles.twinkle2}>
        <circle cx="148" cy="96" r="4.6" fill="url(#mcNode)" /><path d="M148 84V108M136 96H160" stroke="#f2feff" strokeOpacity=".75" strokeWidth=".6" />
        <circle cx="86" cy="42" r="3.6" fill="url(#mcNode)" />
      </g>
    </g>

    <ellipse cx="100" cy="102" rx="72" ry="54" fill="url(#mcPlate)" />
    {/* the glass skin: edge, double edge, reflections (they slide with the yaw) */}
    <g className={styles.skin}>
      <path d="M144.1 17.0A94 94 0 0 1 193.1 86.9A58 58 0 0 1 144.1 17.0Z" fill="url(#mcHiSoft)" />
      <path d="M15.5 58.8A94 94 0 0 1 80.5 8.1A66 66 0 0 1 15.5 58.8Z" fill="url(#mcHiSoft)" />
      <path d="M188.3 132.1A94 94 0 0 1 132.1 188.3A70 70 0 0 1 188.3 132.1Z" fill="url(#mcHiSoft)" />
      <path d="M9.8 67.2A96 96 0 0 1 120.0 6.1A150 150 0 0 0 9.8 67.2Z" fill="url(#mcHi)" />
      <path d="M24.6 49.1A91 91 0 0 1 87.3 9.9A118 118 0 0 0 24.6 49.1Z" fill="url(#mcHi)" />
      <path d="M142.1 13.7A96 96 0 0 1 194.5 83.3A150 150 0 0 0 142.1 13.7Z" fill="url(#mcHiSoft)" />
      <path d="M193.1 123.2A96 96 0 0 1 106.7 195.8A150 150 0 0 0 193.1 123.2Z" fill="url(#mcHi)" />
      <path d="M49.1 181.4A96 96 0 0 1 4.9 113.4A140 140 0 0 0 49.1 181.4Z" fill="url(#mcHiSoft)" />
    </g>
    <g className={styles.rim}>
      <circle cx="100" cy="100" r="97" fill="none" stroke="url(#mcRim)" strokeWidth="2.4" />
      <circle cx="100" cy="100" r="94.2" fill="none" stroke="#ffffff" strokeOpacity=".16" strokeWidth="1.2" />
      <circle cx="100" cy="100" r="92.5" fill="none" stroke="#c9f6fc" strokeOpacity=".2" strokeWidth=".8" />
    </g>
  </svg>;
}
