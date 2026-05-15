import { useMemo } from 'react';
import { Text, View } from 'react-native';

import type { DailyFastLevel } from '@/src/hooks/use-fasting';
import { dowMondayFirst, ymd } from '@/src/lib/time';
import { fonts, tokens } from '@/theme/tokens';

/**
 * Heatmap intensity palette — pre-computed sRGB mixes of `tokens.ink` over
 * `tokens.bg` (30% / 55% / 85%) plus `tokens.accentInk` for the PB tier.
 *
 * Why these percentages and not the original 18 / 40 / 75 from the design
 * source: the old palette's near-black ink + warm-cream bg produced clear
 * grays at those ratios. The Mist · Petrol ink is a deep teal (lighter
 * than the old near-black) and the bg is a cooler gray-cream, so the same
 * ratios collapsed level-1 into the bg, making "logged but short" cells
 * indistinguishable from "missed". Bumping to 30 / 55 / 85 restores the
 * step contrast.
 *
 * Recompute whenever the ink/bg tokens change — there's a `node -e`
 * snippet in the commit that introduced these values that does it.
 */
export const HEAT_COLORS = [
  tokens.bg2,        // 0 — empty cell
  '#ADB9B9',         // 1 — < 12h
  '#798B8D',         // 2 — 12–15h
  '#3A5558',         // 3 — 16h+ (target)
  tokens.accentInk,  // 4 — 18h+ (PB)
] as const;

type Cell = { date: string; level: DailyFastLevel };

type Props = {
  cells: ReadonlyArray<Cell>;
  /** weeks rendered = cells.length / 7; must be a multiple of 7. */
  weeks?: number;
  /** Today, for highlighting the "current" cell. Defaults to local today. */
  today?: Date;
};

const CELL = 14;
const GAP = 3;

/**
 * GitHub-style contribution grid, 7 rows (Mon→Sun) × N weeks.
 * The newest cell is bottom-right of the last column = today's row;
 * trailing cells (Fri/Sat/Sun on a Thursday "today") are left blank.
 */
export function StreakHeatmap({ cells, weeks = 14, today: providedToday }: Props) {
  const today = providedToday ?? new Date();
  const todayKey = ymd(today);
  const todayRow = dowMondayFirst(today);

  // Lay out cells in (col, row) order, right-aligned to today.
  // grid[col][row] = Cell | null
  const grid = useMemo<(Cell | null)[][]>(() => {
    const out: (Cell | null)[][] = Array.from({ length: weeks }, () => Array(7).fill(null));
    if (cells.length === 0) return out;

    const lastIndex = cells.length - 1;
    // last filled position
    const lastCol = weeks - 1;
    const lastRow = todayRow;

    for (let i = 0; i <= lastIndex; i++) {
      // `offset` is days-since-today. cells[0] is the OLDEST entry in the
      // window, so i=0 ⇒ offset=lastIndex (largest), and i=lastIndex ⇒
      // offset=0 (today).
      const offset = lastIndex - i;
      const flat = lastCol * 7 + lastRow - offset;
      // The first few cells in the array can be older than the grid spans
      // (when today isn't a Sunday, the leading-column rows above the
      // top-left would land at flat < 0). Skip those — do NOT break, or
      // we'd abort before placing the cells that *do* fit.
      if (flat < 0) continue;
      const col = Math.floor(flat / 7);
      const row = flat % 7;
      out[col][row] = cells[i];
    }
    return out;
  }, [cells, weeks, todayRow]);

  const monthLabels = useMemo(() => buildMonthLabels(cells, weeks, today), [cells, weeks, today]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
      {/* Day-of-week labels — M _ W _ F _ S */}
      <View style={{ marginTop: 16, gap: GAP }}>
        {['M', '', 'W', '', 'F', '', 'S'].map((d, i) => (
          <View
            key={i}
            style={{
              height: CELL,
              minWidth: 10,
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}>
            <Text
              style={{
                fontFamily: fonts.mono,
                fontSize: 7.5,
                color: tokens.ink4,
                letterSpacing: 0.45,
                lineHeight: CELL,
              }}>
              {d}
            </Text>
          </View>
        ))}
      </View>

      {/* Grid + month-label band */}
      <View style={{ flex: 1 }}>
        {/* Month label band — absolute-positioned tags above each transition column */}
        <View style={{ position: 'relative', height: 14, marginBottom: 2 }}>
          {monthLabels.map((m) => (
            <Text
              key={`${m.col}-${m.label}`}
              style={{
                position: 'absolute',
                left: m.col * (CELL + GAP),
                fontFamily: fonts.mono,
                fontSize: 8,
                color: tokens.ink4,
                letterSpacing: 1.28,
                textTransform: 'uppercase',
              }}>
              {m.label}
            </Text>
          ))}
        </View>

        {/* The grid — flex columns */}
        <View style={{ flexDirection: 'row', gap: GAP }}>
          {grid.map((column, colIdx) => (
            <View key={colIdx} style={{ gap: GAP }}>
              {column.map((cell, rowIdx) => {
                if (cell === null) {
                  return <View key={rowIdx} style={{ width: CELL, height: CELL }} />;
                }
                const isToday = cell.date === todayKey;
                const fill = HEAT_COLORS[cell.level];
                return (
                  <View key={rowIdx} style={{ width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' }}>
                    {isToday && (
                      <View
                        style={{
                          position: 'absolute',
                          top: -2,
                          left: -2,
                          right: -2,
                          bottom: -2,
                          borderRadius: 4,
                          borderWidth: 1.5,
                          borderColor: tokens.ink,
                        }}
                      />
                    )}
                    <View
                      style={{
                        width: CELL,
                        height: CELL,
                        borderRadius: 3,
                        backgroundColor: fill,
                        borderWidth: cell.level === 0 ? 1 : 0,
                        // line2 reads ~4× more contrast against bg than line
                        // does — without it the cool-tone level-0 cells fade
                        // into the screen background and the grid pattern
                        // vanishes.
                        borderColor: tokens.line2,
                        // PB glow
                        ...(cell.level === 4 && {
                          shadowColor: tokens.accent,
                          shadowOffset: { width: 0, height: 0 },
                          shadowRadius: 6,
                          shadowOpacity: 1,
                        }),
                      }}
                    />
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * Compute month labels by walking columns left-to-right and emitting a
 * label every time the month of that column's first non-null cell differs
 * from the previous emitted month.
 */
function buildMonthLabels(
  cells: ReadonlyArray<Cell>,
  weeks: number,
  today: Date,
): ReadonlyArray<{ col: number; label: string }> {
  if (cells.length === 0) return [];
  const todayRow = dowMondayFirst(today);
  const todayMs = today.getTime();
  const totalDays = weeks * 7;

  // date for (col, row) — use the same right-aligned mapping as `grid` above
  const dateFor = (col: number, row: number): Date | null => {
    const flat = col * 7 + row;
    const lastFlat = (weeks - 1) * 7 + todayRow;
    const offset = lastFlat - flat;
    if (offset < 0 || offset >= totalDays) return null;
    return new Date(todayMs - offset * 86_400_000);
  };

  const fmt = new Intl.DateTimeFormat('en', { month: 'short' });
  const out: { col: number; label: string }[] = [];
  let lastMonth = -1;
  for (let col = 0; col < weeks; col++) {
    // pick the first valid row in this column
    let d: Date | null = null;
    for (let row = 0; row < 7; row++) {
      d = dateFor(col, row);
      if (d) break;
    }
    if (!d) continue;
    if (d.getMonth() !== lastMonth) {
      lastMonth = d.getMonth();
      out.push({ col, label: fmt.format(d).toLowerCase() });
    }
  }
  return out;
}
