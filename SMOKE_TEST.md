# Smoke test — first install on device

Run top-to-bottom. Skip anything not exercised by your current usage. Expected behavior in italics; failures in **bold** = filing-grade.

## 0. Boot

- [ ] App opens to the Home screen without a crash
- [ ] No "Database failed to initialize" red screen
- [ ] Splash dismisses cleanly

*Migrations 0000-0010 apply on first launch. If you see the migration error screen, screenshot the message — that's a data-layer bug.*

## 1. HK auth — first grant

- [ ] Navigate to **/weight-settings** → tap **Connect**
- [ ] iOS sheet appears listing read/write categories
- [ ] Toggle **all on**, tap Allow
- [ ] Settings page returns; status changes to the auto-import toggle (live update, no app restart)
- [ ] Repeat on **/workouts-settings** → Connect (separate scope, separate prompt)

*If the page doesn't refresh after Allow without backgrounding, the auth-listener pub/sub is broken.*

## 2. HK auth — denial recovery

- [ ] iOS Settings → Privacy & Security → Health → Maß → toggle off **all** weight permissions
- [ ] Back in app, /weight-settings shows the "Apple Health off — re-enable in iOS Settings" hint
- [ ] Re-enable in iOS Settings → page recovers without backgrounding

## 3. Weight — read

- [ ] /weight stat hero shows your most recent kg from Apple Health
- [ ] Chart renders with 7-day MA if you have ≥7 entries
- [ ] Range chips (7D / 14D / 30D / start) all show data; **start** shows the full history
- [ ] Recent entries list populates in desc order

## 4. Weight — write round-trip

- [ ] Tap **+ log** → enter a weight (use a fake value like 78.3 to spot it in HK) → save
- [ ] Recent entries row appears at the top
- [ ] Open **Apple Health → Browse → Body Measurements → Weight** → new sample visible with today's timestamp
- [ ] Background the app for 30s, foreground → recent-entries does **not** duplicate the row (UUID dedupe works)

## 5. Weight — target editing

- [ ] /weight-settings → tap the target kg tile → stepper sheet opens
- [ ] ±0.5 kg steppers snap to a clean grid (no drift like 78.3 → 78.8 → 79.3)
- [ ] Saving updates the chart's goal line + ETA

## 6. Workouts — week view

- [ ] /workouts hero shows `0 / N planned` for this week
- [ ] Week strip cells: weekday letters + workout glyphs colored per tone
- [ ] Today's cell highlighted; past empty days = `missed`; future planned = `planned`; rest = italic
- [ ] Today card shows planned type + `planned HH:MM · 60m`

## 7. Workouts — plan day

- [ ] /workouts-settings → tap a weekday row → PlanDayDrawer opens
- [ ] Type grid: 5 built-in types + Rest tile
- [ ] Tap a non-rest type → info card shows step breakdown subline (e.g. `60m functional strength training`)
- [ ] Time presets: morning/afternoon/evening highlight when matching
- [ ] Tap big HH:MM display → DateTimePickerSheet opens for fine pick
- [ ] CTA reads `plan <weekday>` → tap → drawer closes, weekly template row updates

## 8. Workouts — log composite

- [ ] /workouts today card → **+ log** → drawer opens
- [ ] Type chips populate from the live library
- [ ] Selecting a type shows `ends HH:MM · 60m total` (derived from step sum)
- [ ] Save → drawer closes, recent sessions list shows the new row
- [ ] Open **Apple Health → Workouts** → see N samples back-to-back from your start time (N = number of steps in the chosen type; 1 for built-ins)
- [ ] Background + foreground → no duplicate session row

## 9. Workouts — linking

- [ ] If you logged a workout for **today** that matches today's planned type → today's cell flips to `done` with the dark pip
- [ ] Recent sessions: composite completion shows the type label (e.g. "Push") not the raw HK activity
- [ ] If you logged an off-plan workout → row label reads humanized HK activity (e.g. "Functional strength training")

## 10. Custom workout types (#72)

- [ ] /workouts-settings → "workout types" section: 5 built-in rows, each with a small `built-in` pill
- [ ] Tap a built-in row → editor opens but everything is disabled, CTA reads `built-in · read only`
- [ ] Close → tap dashed **new type** → editor opens in create mode
- [ ] Name → key auto-derives kebab-case in real time
- [ ] Try a name that slugifies to an existing key (e.g. "Push") → error: `key already in use`
- [ ] Pick a name like "Marathon prep" → 4 tone chips + 4 icon tiles selectable
- [ ] Steps: default 1 step. Tap **+ add step** → 2nd row appears
- [ ] Step row: ± buttons adjust 5-min, up/down reorder, × delete (disabled when only 1 step)
- [ ] Tap the activity button → bottom sheet with 6 HK activities → pick one → returns to editor
- [ ] CTA reads `save · 90m total` (matches sum) → tap → drawer closes, library shows the new row
- [ ] Open the new row → editor opens in edit mode; mutate; save again → row updates
- [ ] Open again → **delete type** (red, bottom) → confirm → drawer closes, row gone
- [ ] /workouts-settings template row that referenced the deleted type now reads `Rest`

## 11. Custom type → plan → log → link (end-to-end)

- [ ] Create a custom type: `Test composite` = `[15m walking, 10m functionalStrengthTraining]`
- [ ] /workouts-settings → tap today's weekday → assign `Test composite`, set time to ~now
- [ ] /workouts today card shows `Test composite · planned HH:MM · 25m (2 steps)`
- [ ] In Apple Health, manually start + stop two workouts that match the steps' durations + activities (or use the Watch)
- [ ] Foreground Maß → recent sessions group both HK samples into one row labeled `Test composite`
- [ ] Today's cell flips to `done`

## 12. Settings — source mapping

- [ ] /workouts-settings → "apple health → auto-import sources" section
- [ ] Lists each HK activity used across all types' candidate keys
- [ ] Each row → `function strength training → push · pull · legs` (etc.)
- [ ] Adding a custom type with a new activity → that activity appears in this list

## 13. Settings — linking rules

- [ ] /workouts-settings → "linking rules" section
- [ ] `auto-link by step sequence` always shows `on` pill
- [ ] `time window` row: ±N steppers (range 15-360, step 15)
- [ ] Adjusting the window changes how much HK time-drift the linker tolerates

## Known gaps (not bugs)

- Drag-handle reorder in step builder (uses up/down arrows; #72 follow-up)
- Per-step `hkCandidateKeys` multi-select (defaults to `[primary]`; broader matching needs new step)
- Duplicate-built-in-as-custom flow
- One-off slot overrides ("this week only" radio is disabled — #81)
- Reminders (#73)
