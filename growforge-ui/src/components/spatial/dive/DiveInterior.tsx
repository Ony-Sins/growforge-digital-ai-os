"use client";

import { useId } from "react";
import styles from "./DiveOverview.module.css";

/** Abstract CORE material only. These surfaces never represent activity or relationships. */
export function DiveInterior() {
  const id = useId().replace(/:/g, "");
  return <div className={styles.interior} aria-hidden="true">
    <div className={styles.interiorLight} />
    <svg className={styles.interiorGeometry} viewBox="0 0 1920 1080" preserveAspectRatio="none" focusable="false">
      <defs>
        <linearGradient id={`${id}-surface`} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#08234a" stopOpacity=".65" /><stop offset=".55" stopColor="#0b3656" stopOpacity=".28" /><stop offset="1" stopColor="#02101c" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#1a4a79" stopOpacity="0" /><stop offset=".28" stopColor="#397cbd" stopOpacity=".32" /><stop offset=".58" stopColor="#75c8e8" stopOpacity="1" /><stop offset=".8" stopColor="#225db6" stopOpacity=".26" /><stop offset="1" stopColor="#092340" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="white" /><stop offset=".18" stopColor="white" stopOpacity=".65" /><stop offset=".32" stopColor="black" /><stop offset=".68" stopColor="black" /><stop offset=".82" stopColor="white" stopOpacity=".65" /><stop offset="1" stopColor="white" />
        </linearGradient>
        <mask id={`${id}-periphery`}><rect width="1920" height="1080" fill={`url(#${id}-fade)`}/></mask>
        <filter id={`${id}-refraction`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency=".013 .042" numOctaves="2" seed="17" result="grain"/>
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="24" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
        <filter id={`${id}-haze`}><feGaussianBlur stdDeviation="12"/></filter>
      </defs>
      <g mask={`url(#${id}-periphery)`}>
        <g fill={`url(#${id}-surface)`} className={styles.membraneSkin}>
          <path d="M-180 -100C370 130 40 385 325 628S100 1110 320 1200H-180Z"/>
          <path d="M-70 -100C125 160 435 260 216 565S461 872 260 1200H-70Z" opacity=".45"/>
          <g transform="translate(1920 0) scale(-1 1)"><path d="M-180 -100C335 65 74 436 301 617S140 1020 360 1200H-180Z"/><path d="M-70 -100C190 212 388 317 205 570S412 964 241 1200H-70Z" opacity=".45"/></g>
        </g>
        <g fill="none" stroke={`url(#${id}-edge)`} strokeWidth="1.6" className={styles.membraneEdges}>
          <path d="M78 -100C296 175 70 315 203 564S202 900 101 1200"/>
          <path d="M315 -100C96 200 406 332 269 633S418 924 280 1200" opacity=".38"/>
          <path d="M-70 67C214 185 19 401 136 722S24 973 150 1160" opacity=".25"/>
          <path d="M1788 -100C1550 144 1857 407 1715 580S1790 955 1831 1200"/>
          <path d="M1590 -100C1845 272 1530 413 1680 690S1505 945 1620 1200" opacity=".38"/>
          <path d="M1980 47C1730 251 1889 465 1794 772S1930 969 1808 1160" opacity=".25"/>
        </g>
        <g className={styles.membraneCaustics} filter={`url(#${id}-refraction)`} fill="none" stroke="#4ca9e0" strokeWidth=".7">
          <path d="M26 25C220 177 3 247 160 421S78 664 224 915M54 99C226 278 69 325 175 505S89 810 185 1080"/>
          <path d="M1770 -10C1860 227 1630 289 1791 516S1665 861 1875 1070M1900 78C1641 349 1848 483 1730 687S1908 951 1772 1120"/>
        </g>
        <g fill="none" stroke="#2285c5" strokeWidth="10" opacity=".2" filter={`url(#${id}-haze)`}>
          <path d="M78 -100C296 175 70 315 203 564S202 900 101 1200"/><path d="M1788 -100C1550 144 1857 407 1715 580S1790 955 1831 1200"/>
        </g>
      </g>
    </svg>
    <div className={styles.interiorReflection} />
  </div>;
}
