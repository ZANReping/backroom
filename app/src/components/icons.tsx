// 24px 线性 SVG 图标集
import type { SVGProps } from 'react'

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  ...props,
})

export const IconHP = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>
)
export const IconStamina = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" /></svg>
)
export const IconHunger = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M8 3v7a4 4 0 0 0 8 0V3" /><path d="M12 14v7" /><path d="M6 3v4M18 3v4" /></svg>
)
export const IconSanity = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 4a4 4 0 0 0-4 4c0 1 .3 1.8.8 2.5A4 4 0 0 0 5 14a4 4 0 0 0 4 4c.5 0 1-.1 1.5-.3A4 4 0 0 0 12 20a4 4 0 0 0 4-4V8a4 4 0 0 0-7-4z" /><path d="M12 4v16" /></svg>
)
export const IconBattery = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="7" y="4" width="10" height="17" rx="1" /><path d="M10 2h4" /><path d="M11 9h2v4h-2z" fill="currentColor" /></svg>
)
export const IconFlashlight = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M8 3h8l-2 6v12h-4V9L8 3z" /><path d="M12 13v2" /></svg>
)
export const IconBackpack = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 8a6 6 0 0 1 12 0v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /><path d="M6 13h12" /></svg>
)
export const IconPause = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 5v14M15 5v14" /></svg>
)
export const IconMap = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></svg>
)
export const IconInteract = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M8 12V6a2 2 0 0 1 4 0v5" /><path d="M12 11l4-1a2 2 0 0 1 2 3l-3 6a4 4 0 0 1-4 2h-1a4 4 0 0 1-4-4v-3l2-3" /></svg>
)
export const IconAttack = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 20 16 8l4-4-2 6-6 8-8 2z" /><path d="M4 20l4-4" /></svg>
)
export const IconSprint = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M13 4a2 2 0 1 0 0 .01z" /><path d="M6 21l3-6 2-3 4 2 3 1" /><path d="M9 15l-4 2" /><path d="M11 9l-4 1" /></svg>
)
export const IconJump = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 4v9" /><path d="M7 9l5-5 5 5" /><path d="M5 20h14" /></svg>
)
export const IconCrouch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M14 4a2 2 0 1 0 0 .01z" /><path d="M7 21v-5l4-3 4 2v6" /><path d="M7 16h6" /><path d="M15 21h4" /></svg>
)
export const IconFullscreen = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
)
export const IconFullscreenExit = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
)
export const IconIsolation = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="7.5" r="2.5" /><path d="M7 19.5c0-3 2.2-4.8 5-4.8s5 1.8 5 4.8" /><path d="M2 12h2.5M19.5 12H22" /></svg>
)
export const IconPlant = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 21v-9" /><path d="M12 12c0-4 2.5-6.5 7-6.5 0 4-2.5 6.5-7 6.5z" /><path d="M12 15c0-3.5-2.2-5.5-6-5.5 0 3.5 2.2 5.5 6 5.5z" /></svg>
)
export const IconSkull = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3a8 8 0 0 0-8 8c0 3 1.5 5 3.5 6.5V21h9v-3.5C18.5 16 20 14 20 11a8 8 0 0 0-8-8z" /><path d="M9 11h.01M15 11h.01" strokeWidth="3" /></svg>
)
