/**
 * Weight ↔ HealthKit adapter. Bridges the generic HK helpers
 * (`syncQuantityType`, `getHkAuthState`) with the local query layer
 * (`addWeightEntry`, etc.) so feature code doesn't have to wire the
 * details every time.
 *
 * Pull path: `syncWeightFromHealthKit` reads body-mass samples since the
 * stored anchor and upserts them locally. Deletes flow through too.
 *
 * Push path: `logWeight` writes a manual entry locally, then — if HK
 * auth is granted and the user hasn't disabled auto-import — pushes
 * the same value to HK and backfills the returned UUID onto the local
 * row. The UUID linkage means a follow-up HK pull won't double-count.
 *
 * Edits / deletes on rows that already have a `healthkit_uuid` are
 * intentionally NOT mirrored back to HK in v1 — see issue #53 notes for
 * the tradeoff. The next anchored pull from HK is the source of truth
 * for those rows.
 */

import { saveQuantitySample } from '@kingstinct/react-native-healthkit';

import {
  addWeightEntry,
  attachHealthKitUuid,
  deleteWeightEntryByHealthKitUuid,
} from '@/src/db/queries/weight';
import { getPreferences as getWeightPreferences } from '@/src/db/queries/weight-preferences';
import type { WeightEntry } from '@/src/db/schema';

import { getHkAuthState, type HkPermissionRequest } from './auth';
import { syncQuantityType, type SyncQuantityResult } from './sync';

const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass' as const;

/**
 * First-time pull bound. HK can hold years of body-mass history; pulling
 * all of it on the very first auth grant would be a multi-second blast on
 * the JS thread. Two years covers anyone's recent weight journey while
 * keeping the initial sync snappy. Anchored deltas after that aren't
 * date-bounded — the user gets every future sample regardless.
 */
const INITIAL_PULL_YEARS_BACK = 2;

/**
 * Permission set for body-mass read + write. Defined at module level so
 * `useHkAuthState(BODY_MASS_PERMISSIONS)` doesn't trigger a re-subscribe
 * on every render (the hook keys off identifier strings, but a stable
 * ref is still cheaper).
 */
export const BODY_MASS_PERMISSIONS: HkPermissionRequest = {
  toRead: [BODY_MASS],
  toShare: [BODY_MASS],
};

/**
 * Pull body-mass samples from HK and upsert them locally. Skips the call
 * entirely when `prefs.autoImportHealthKit` is false so users can opt out
 * without revoking system permissions.
 */
export async function syncWeightFromHealthKit(): Promise<SyncQuantityResult> {
  const prefs = await getWeightPreferences();
  if (!prefs.autoImportHealthKit) {
    return { inserted: 0, deleted: 0, skipped: true, dryRun: false };
  }

  const since = new Date();
  since.setFullYear(since.getFullYear() - INITIAL_PULL_YEARS_BACK);

  return syncQuantityType({
    identifier: BODY_MASS,
    unit: 'kg',
    since,
    onSample: async (sample, tx) => {
      await addWeightEntry(
        {
          at: sample.startDate,
          kg: sample.quantity,
          healthkitUuid: sample.uuid,
        },
        tx,
      );
    },
    onDelete: async (uuid, tx) => {
      await deleteWeightEntryByHealthKitUuid(uuid, tx);
    },
  });
}

/**
 * Log a manual weigh-in. Always writes locally; pushes to HK opportunistically.
 *
 * Push is best-effort: if HK is denied or the save errors, the local row
 * still sticks. The caller doesn't need to know — they get the entry back
 * with whatever fields the push managed to set (UUID + source flipping
 * to 'healthkit' if the write succeeded).
 */
export async function logWeight(opts: {
  kg: number;
  at?: Date;
}): Promise<WeightEntry> {
  const entry = await addWeightEntry({
    kg: opts.kg,
    at: opts.at,
  });

  const prefs = await getWeightPreferences();
  if (!prefs.autoImportHealthKit) return entry;

  const auth = await getHkAuthState(BODY_MASS_PERMISSIONS);
  if (auth !== 'granted') return entry;

  try {
    const at = opts.at ?? entry.at;
    const saved = await saveQuantitySample(BODY_MASS, 'kg', opts.kg, at, at);
    if (saved?.uuid) {
      await attachHealthKitUuid(entry.id, saved.uuid);
      return { ...entry, healthkitUuid: saved.uuid };
    }
    return entry;
  } catch (err) {
    // Don't surface to the user — the local write succeeded, only the
    // mirror to HK didn't. Future autosyncs will reconcile if/when
    // permissions get sorted.
    console.warn('Failed to write weight to HealthKit:', err);
    return entry;
  }
}
