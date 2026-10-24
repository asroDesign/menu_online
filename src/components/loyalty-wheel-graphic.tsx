"use client";

import { useId, type CSSProperties } from "react";
import { wheelPoint, wheelSectorPath, wheelSectors } from "@/lib/wheel-geometry";
import styles from "./loyalty-wheel-graphic.module.css";

type Segment = { id: number; title: string; weight: number };
const palette = ["#6d35c7", "#d74791", "#167d9a", "#d17a26", "#3f49ab", "#288969", "#a63d91", "#316bb5"];

export function LoyaltyWheelGraphic({ segments, rotation, duration, spinning, won, resultKey }: {
  segments: Segment[]; rotation: number; duration: number; spinning: boolean; won: boolean; resultKey?: number;
}) {
  const id = useId().replaceAll(":", "");
  const sectors = wheelSectors(segments.map(segment => segment.weight));
  return <section className={`${styles.stage} ${spinning ? styles.spinning : ""} ${won ? styles.won : ""}`} aria-label="گردونهٔ جایزه">
    <div className={styles.heading}><span className={styles.eyebrow}>یک چرخش، یک اتفاق شیرین</span><strong>{spinning ? "شانس تو در راه است…" : won ? "این لحظه برای توست!" : "نوبت خوش‌شانسی توست"}</strong></div>
    <div className={styles.stars} aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <span key={index} style={{ left: `${7 + (index * 31) % 88}%`, top: `${18 + (index * 17) % 65}%`, animationDelay: `${index * .19}s` }}>✦</span>)}</div>
    <div className={styles.machine}>
      <div className={styles.halo} aria-hidden="true" />
      <svg className={styles.wheel} viewBox="0 0 400 430" role="img" aria-label={segments.length ? "گردونه با جایزه‌های فهرست‌شده در پایین" : "گردونه بدون جایزهٔ فعال"}>
        <defs>
          <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff1b9"/><stop offset=".27" stopColor="#d9912b"/><stop offset=".5" stopColor="#ffeab0"/><stop offset=".78" stopColor="#a76020"/><stop offset="1" stopColor="#ffdf8c"/></linearGradient>
          <radialGradient id={`${id}-hub`}><stop stopColor="#fff8d9"/><stop offset=".7" stopColor="#ffe19b"/><stop offset="1" stopColor="#d49437"/></radialGradient>
          <radialGradient id={`${id}-sheen`} cx=".3" cy=".2" r=".8"><stop stopColor="white" stopOpacity=".23"/><stop offset=".5" stopColor="white" stopOpacity="0"/><stop offset="1" stopColor="#0d082a" stopOpacity=".35"/></radialGradient>
        </defs>
        <ellipse cx="200" cy="412" rx="112" ry="10" fill="#000" opacity=".3"/>
        <path d="M171 344 H229 L249 401 H151 Z" fill={`url(#${id}-gold)`}/>
        <rect x="128" y="397" width="144" height="14" rx="7" fill={`url(#${id}-gold)`}/>
        <circle cx="200" cy="204" r="192" fill="#070719" opacity=".7"/>
        <circle cx="200" cy="200" r="192" fill={`url(#${id}-gold)`}/>
        <circle cx="200" cy="200" r="184" fill="#35214c" stroke="#f6cc78" strokeWidth="2"/>
        <g className={styles.rotor} style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${duration}ms` }}>
          <circle cx="200" cy="200" r="168" fill="#423764"/>
          {sectors.map((sector, index) => <g key={segments[index].id}>
            <path d={wheelSectorPath(sector.start, sector.end)} fill={palette[index % palette.length]} stroke="#ffe3a1" strokeOpacity=".7" strokeWidth="1.3"/>
            {sector.end - sector.start >= 10 && <g transform={`rotate(${sector.center} 200 200)`}>
              <path d="m200 51 3.5 7 7.5 1-5.5 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6L189 59l7.5-1Z" fill="#ffe4a4"/>
              <text x="200" y="94" textAnchor="middle" fill="white" fontSize="17" fontWeight="900">{(index + 1).toLocaleString("fa-IR")}</text>
              {sector.end - sector.start >= 38 && <text x="200" y="119" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" direction="rtl">{segments[index].title.length > 16 ? `${segments[index].title.slice(0, 15)}…` : segments[index].title}</text>}
            </g>}
          </g>)}
          <circle cx="200" cy="200" r="167" fill={`url(#${id}-sheen)`}/>
        </g>
        {Array.from({ length: 32 }, (_, index) => { const point = wheelPoint(index * 360 / 32, 177); return <circle key={index} className={styles.bulb} cx={point.x} cy={point.y} r="3.5" fill="#fff0ba" style={{ animationDelay: `${index * .055}s` }}/>; })}
        <circle cx="200" cy="203" r="49" fill="#120b29" opacity=".35"/>
        <circle cx="200" cy="200" r="46" fill={`url(#${id}-gold)`} stroke="#fff0b9" strokeWidth="2"/>
        <circle cx="200" cy="200" r="38" fill={`url(#${id}-hub)`}/>
        <g className={styles.gift} fill="none" stroke="#77451f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M181 196h38v9h-38z M184 205v19h32v-19 M200 195v29 M200 195c-22 0-17-19-7-11l7 11c22 0 17-19 7-11Z"/>
        </g>
        <g className={styles.pointer}><path d="M185 7 Q200 -1 215 7 L210 25 200 43 190 25Z" fill={`url(#${id}-gold)`} stroke="#fff2c4" strokeWidth="2"/><circle cx="200" cy="13" r="4" fill="#9b5225"/></g>
      </svg>
      {won && <div key={resultKey} className={styles.celebration} aria-hidden="true"><div className={styles.burst}/>{Array.from({ length: 36 }, (_, index) => <i key={index} style={{ "--x": `${(index * 47) % 340 - 170}px`, "--y": `${-80 - (index * 31) % 240}px`, "--turn": `${index * 57}deg`, "--delay": `${(index % 7) * .07}s`, background: ["#ffe19c", "#e985c6", "#82e2d0", "#b9a5ff"][index % 4] } as CSSProperties}/>)}</div>}
    </div>
    <p className={styles.caption} role="status">{spinning ? "گردونه در حال چرخش است؛ منتظر نتیجه باش" : !segments.length ? "هنوز جایزه‌ای برای این گردونه فعال نشده" : won ? "جایزه‌ات پایین گردونه منتظر توست" : "جایزه‌ها را ببین و شانست را امتحان کن"}</p>
    {!!segments.length && <ol className={styles.legend} aria-label="جایزه‌های گردونه">{segments.map((segment, index) => <li key={segment.id}><span style={{ background: palette[index % palette.length] }}>{(index + 1).toLocaleString("fa-IR")}</span><span>{segment.title}</span></li>)}</ol>}
  </section>;
}
