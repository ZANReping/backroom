// Internal level IDs, not array positions or translated titles. Unknown levels
// intentionally keep Level 0's original presentation. 601 is its display alias.
const THEMES: Readonly<Record<number, string>> = {
  0: 'default', 1: 'habitat', 2: 'pipes', 3: 'power', 4: 'office',
  5: 'hotel', 6: 'dark', 7: 'ocean', 8: 'cave', 9: 'suburb',
  10: 'wheat', 11: 'city', 12: 'end', 601: 'end',
  101: 'meg', 102: 'trade', 103: 'medical', 104: 'diner',
  105: 'office', 106: 'meg', 107: 'trade', 108: 'blue',
  109: 'meg', 110: 'meg', 111: 'hotel', 112: 'hotel',
  113: 'cave', 114: 'cave', 115: 'meg', 116: 'wheat', 274: 'blue',
}

export function levelTitleTheme(levelId?: number): string {
  return levelId === undefined ? 'default' : THEMES[levelId] ?? 'default'
}
