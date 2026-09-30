// Three small decorative strokes shared by both title cards. No canvas, timers,
// duplicate text, or per-frame React updates; motion lives in LevelTitleTheme.css.
export default function LevelTitleOrnament({ theme }: { theme: string }) {
  return theme === 'default' ? null : <div className="level-title__ornament" aria-hidden="true"><i /><i /><i /></div>
}
