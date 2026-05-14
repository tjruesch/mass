# TODO

Tracking deferred work. Each item is shaped like a GitHub issue: title, why it matters, what "done" looks like, and a suggested label set. Items use `- [ ]` so they convert cleanly via `gh issue create`.

---

## Slices — feature work to do next, in suggested order

### Slice 2 — Water
- [ ] **slice: water logging end-to-end**
  - **Why:** Simplest CRUD slice; validates the patterns from fasting (live query hook, mutations, navigation) on a smaller surface before we hit HealthKit-mirror complexity.
  - **What's in scope:** `screen-water.jsx` port, water entry mutations, today's total reactive on home card.
  - **Labels:** `area:water`, `kind:feature`, `slice:2`

### Slice 3 — Weight (HealthKit mirror, pass 1)
- [ ] **slice: weight tracking + HealthKit mirror**
  - **Why:** First time we touch the source-of-truth split. Sets the dedupe-by-`healthkit_uuid` pattern that workouts will reuse.
  - **What's in scope:** `screen-weight.jsx` port, HK pull for `HKQuantityTypeIdentifierBodyMass`, write-through when user logs in app, anchored sync via `hk_sync_cursor`.
  - **Labels:** `area:weight`, `kind:feature`, `slice:3`, `integration:healthkit`

### Slice 4 — Workouts
- [ ] **slice: workouts + HK mirror, second pass**
  - **Why:** Reuses the HK mirror pattern from slice 3. Adds typed `workoutActivityType` enum and surfaces watch-recorded workouts.
  - **What's in scope:** `screen-workouts.jsx`, `screen-workouts-newtype.jsx`, `screen-workouts-plan.jsx` ports. HK pull for workouts. Manual workout entry.
  - **Labels:** `area:workouts`, `kind:feature`, `slice:4`, `integration:healthkit`

### Slice 5 — Meals + pantry
- [ ] **slice: meals, meal_items, pantry**
  - **Why:** Most relational module. The schema already exists; need to validate it against real usage.
  - **What's in scope:** `screen-meals-new.jsx`, `screen-meals-week.jsx`, `screen-meals-settings.jsx`, `screen-pantry.jsx`, `screen-log-drawers.jsx` (the meal logging drawer), `meals-data.jsx` (seed data).
  - **Labels:** `area:meals`, `kind:feature`, `slice:5`

### Slice 6 — Goals + daily targets
- [ ] **slice: goals + daily targets**
  - **Why:** Unlocks the home greeting subline ("day 14 / 28"), the daily rings card targets ("of 1820"), and the deficit footer.
  - **What's in scope:** `screen-plan.jsx`, active goal CRUD, daily target generation per goal, wire home rings/macros to real targets.
  - **Labels:** `area:goals`, `kind:feature`, `slice:6`
  - **Blocks:** the four hardcoded labels in `app/(tabs)/index.tsx` (`On pace`, `day 14 / 28`, ring targets, deficit/TDEE)

### Slice 7 — Trends
- [ ] **slice: trends screen**
  - **Why:** Read-only aggregation across all writers; needs prior slices to have data.
  - **What's in scope:** `screen-trends.jsx` port; weekly/monthly aggregation queries.
  - **Labels:** `area:trends`, `kind:feature`, `slice:7`

### Slice 8 — Apple Health connect flow
- [ ] **slice: apple-health connect screen**
  - **Why:** By now the HK mirror pattern is proven (slices 3+4); this screen is the permission-request UX wrapper.
  - **What's in scope:** `screen-apple-health.jsx` (3-step intro / permission / connected) port; first-run gating.
  - **Labels:** `area:healthkit`, `kind:feature`, `slice:8`

### Slice 9 — Me + Plan polish
- [ ] **slice: me + plan**
  - **Why:** Settings + scheduling. Low-stakes UI; depends on knowing everything else's shape.
  - **What's in scope:** `screen-me.jsx`, `screen-plan.jsx` ports. User name (resolves "Morning, Sam." hardcode). Long-term plan calendar.
  - **Labels:** `area:me`, `area:plan`, `kind:feature`, `slice:9`

### Deferred per architecture decision
- [ ] **AI nudge card on home**
  - **Why:** Designed but not in scope until AI integration is unblocked. Currently hidden.
  - **Done when:** Card renders with daily Claude-API-generated nudge; dismissable; stored in (future) `ai_nudges` table.
  - **Labels:** `area:ai`, `kind:feature`, `deferred`
- [ ] **Voice transmit pill at bottom of every screen**
  - **Why:** Per arch: Apple `Speech` framework for ASR, Claude for parsing into structured logs. Substantial native work.
  - **Done when:** Pill is functional from at least the home screen — records, transcribes on-device, routes parsed intent to the right log table.
  - **Labels:** `area:voice`, `kind:feature`, `deferred`

---

## Home screen — data wiring still missing

Each item is a small follow-up that turns a hardcoded mock value into live data. Most are blocked on a specific slice.

- [ ] **Wire "thu 14 may · 09:41" dateline to real time** (`app/(tabs)/index.tsx`)
  - **Why:** Currently static; should tick once per minute and use the user's locale.
  - **Done when:** A small `useNow(60_000)` + `Intl.DateTimeFormat` replaces the hardcoded string.
  - **Labels:** `area:home`, `kind:wiring`, `effort:small`
- [ ] **Wire "Morning, Sam." greeting heading**
  - **Why:** Hardcoded name + time-of-day greeting. Blocks on Me slice (user name preference).
  - **Done when:** Greeting reads from a `user_preferences` row; time-of-day prefix derives from `useNow`.
  - **Labels:** `area:home`, `kind:wiring`, `effort:small`
  - **Blocked by:** slice 9 (me)
- [ ] **Wire streak chip "streak 12d"**
  - **Why:** Shares streak math with the fasting screen. Could reuse `useFastingHistory().currentStreak`.
  - **Labels:** `area:home`, `kind:wiring`, `effort:trivial`
- [ ] **Wire daily-rings card values** (kcal/h2o/move + their targets + "On pace" / "live" labels)
  - **Why:** Currently all hardcoded. Needs daily targets + cumulative writers from meals/water/workouts slices.
  - **Labels:** `area:home`, `kind:wiring`
  - **Blocked by:** slices 2 + 4 + 5 + 6
- [ ] **Wire macros card** (P/C/F totals + remaining + bar + deficit + TDEE)
  - **Why:** All hardcoded. Needs meals + goals.
  - **Labels:** `area:home`, `kind:wiring`
  - **Blocked by:** slices 5 + 6
- [ ] **Wire "day 14 / 28" in greeting subline**
  - **Why:** Shows current goal day count.
  - **Note:** Already flagged with inline `TODO(goals slice)` comment in `app/(tabs)/index.tsx`.
  - **Labels:** `area:home`, `kind:wiring`, `effort:trivial`
  - **Blocked by:** slice 6 (goals)

---

## Fasting milestone — items explicitly deferred during the slice

- [ ] **Schedule fasting reminders via expo-notifications**
  - **Why:** The four reminder toggles on `/fasting-settings` save the preference but don't schedule anything. Needs `expo-notifications` install + permission flow + scheduled triggers (15min-before-fast-start, eating-window-opens, weekly summary at sun 18:00, post-session check-in).
  - **Done when:** All four toggles, when on, produce actual local notifications at the right times; turning off cancels.
  - **Note:** Reminder note text in `app/fasting-settings.tsx` should be removed once this lands.
  - **Labels:** `area:fasting`, `area:notifications`, `kind:feature`, `integration:native`
- [ ] **Precise eating-window time picker (drag exists; precise input doesn't)**
  - **Why:** The strip is now draggable (15-min snap, translates the whole window). Still missing: tap-to-pick exact times for users who want to type a specific time, and a way to change the window *length* (today, length only changes via protocol chip).
  - **Done when:** Tapping the start or end value in the eating-window card opens an iOS-native time picker that writes back to `eatingWindowStartMin` / `eatingWindowEndMin` directly. Bonus: edge handles on the strip to resize the window.
  - **Labels:** `area:fasting`, `kind:feature`, `effort:small`
- [ ] **Goals rows in fasting settings — make functional**
  - **Why:** Three rows currently render but the chevron tap is a no-op.
    - "weekly adherence X / 7 days" — needs adherence calculation.
    - "streak target 30 days" — needs picker UI.
    - "auto-detect start from food logs" — needs meals slice + heuristic.
  - **Labels:** `area:fasting`, `kind:feature`
  - **Blocked by:** slice 5 (for auto-detect) and slice 6
- [ ] **Persistent navigation warning when leaving settings dirty**
  - **Why:** Backing out of `/fasting-settings` without saving silently drops the changes. Either auto-save or confirm.
  - **Done when:** Either changes auto-commit (preferred — every interaction is a single field) OR a back-press shows a "Discard changes?" alert.
  - **Labels:** `area:fasting`, `kind:polish`, `effort:trivial`

---

## Cross-cutting infrastructure

- [ ] **Replace 2-tab template structure with the designed 5-tab bar**
  - **Why:** Currently the bottom bar is still Expo's default Home + Explore. The designed bar (home / today / plan / trends / me) lives in `components/design/tab-bar.tsx` but isn't wired into `expo-router`'s `<Tabs>`. Today/plan/trends/me have no route files.
  - **Done when:** `app/(tabs)/` has all five routes; the default tab bar is replaced via `<Tabs>`'s `tabBar` prop with the ported `TabBar`; explore route is gone.
  - **Labels:** `area:routing`, `kind:feature`
- [ ] **HealthKitSync service (read pulls + write-through)**
  - **Why:** App will mirror weight + workouts from HealthKit with `healthkit_uuid` dedupe. Currently no sync code exists; the schema is ready (`hk_sync_cursor`, `healthkit_uuid` columns).
  - **Done when:** Service exposes `pullDelta(type)` using anchored queries; `writeWeight(...)` / `writeWorkout(...)` that go to HK first then the local table; background pull on app foreground.
  - **Labels:** `area:healthkit`, `kind:infra`
  - **Blocked by:** none — could be done as scaffolding before slice 3, or as part of slice 3
- [ ] **Safe-area handling on real devices**
  - **Why:** Screens hardcode `paddingTop: 54` matching the 390×844 design frame. Will look wrong on Dynamic Island / non-notched iPhones.
  - **Done when:** Replace literal 54px with `useSafeAreaInsets().top + N` (where N is the small visual gap the design has below the status bar).
  - **Labels:** `kind:polish`, `effort:small`
- [ ] **Dark mode / lane variants**
  - **Why:** `theme/tokens.ts` includes editorial / lab / hardware lane palettes plus a `dark` variant idea. No theme switching wired.
  - **Done when:** A theme context picks the active palette; tokens consumers resolve through it.
  - **Labels:** `kind:design`, `effort:medium`
- [ ] **Drizzle Studio integration for dev DB inspection**
  - **Why:** Right now there's no easy way to see DB state. `expo-drizzle-studio-plugin` exists.
  - **Done when:** Plugin installed, accessible only in dev builds.
  - **Labels:** `area:db`, `kind:dx`, `effort:trivial`

---

## Polish / cleanup

- [ ] **Remove android scripts and android-related dependencies from package.json**
  - **Why:** `platforms: ["ios"]` in app.json but `npm run android` still exists in scripts. Android packages were also pulled in (`react-navigation/bottom-tabs` etc. — harmless but extra weight).
  - **Done when:** Scripts trimmed to iOS + lint + db only; package.json reviewed for android-only packages.
  - **Labels:** `kind:cleanup`, `effort:trivial`
- [ ] **SDWebImage deployment target warning in build**
  - **Why:** Every iOS build emits `Pods/SDWebImage-SDWebImage: iOS@9.0 deployment version mismatch`. Pin / patch a newer deployment target.
  - **Done when:** Build is warning-free (or warning is acknowledged + suppressed in CI).
  - **Labels:** `kind:cleanup`, `effort:trivial`
- [ ] **CloudKit "Not Authenticated" log noise in simulator**
  - **Why:** Build output shows `[CloudKit] SyncEngine error updating userRecordID: ... "No iCloud account is configured"`. Harmless on a fresh simulator but distracts.
  - **Done when:** Either Documented as expected (in README), or CloudKit usage removed if we're not using it.
  - **Labels:** `kind:cleanup`, `effort:trivial`
- [ ] **Sign in to App Store in simulator OR document the warning**
  - **Why:** `managedappdistributiond: Simulator is not supported` floods logs. Cosmetic.
  - **Labels:** `kind:cleanup`, `effort:trivial`

---

## Design files — exploration cleanup

- [ ] **Decide on lane palettes — editorial / lab / hardware**
  - **Why:** Tokens for all four lanes exist in `theme/tokens.ts`. Only Lane 1 (paper/ink) is used today. Either delete the unused lanes or define what they're for.
  - **Labels:** `area:design`, `kind:decision`
- [ ] **Decide on home-screen variants (v1–v5, lab-a–e)**
  - **Why:** `designs/v1-terminal.jsx`, `v2-bento.jsx`, etc. and the lab variants are explorations. `screen-home.jsx` is what we ported. Confirm the rest can stay as reference only.
  - **Labels:** `area:design`, `kind:decision`

---

## Conventions

- Each `- [ ]` is one issue.
- Labels are suggestions; tweak when running `gh issue create`.
- "Blocked by" links are advisory — don't bother blocking-relating them in GH unless multiple people are working in parallel.
- When picking up an item, leave a comment in this file with the issue # next to the item, so this stays the source of truth until the file is deleted.
