/**
 * Anchored HK pull helper.
 *
 * `queryQuantitySamplesWithAnchor` returns a delta since an opaque anchor
 * string. We persist that anchor in `hk_sync_cursor` keyed by HK type
 * identifier so subsequent pulls only see new/deleted samples. The helper
 * is generic: callers supply an `identifier` + `unit` + per-sample and
 * per-delete callbacks, and the helper handles cursor I/O + pagination.
 *
 * Concurrency: a single-flight map prevents two simultaneous syncs of
 * the same identifier from racing (e.g. an app-foreground refresh
 * arriving while a manual "Sync now" tap is still in flight). Different
 * identifiers run in parallel.
 *
 * Pagination: HK returns at most `limit` samples per anchored query.
 * The helper loops until a partial batch is returned (i.e. we've drained
 * the backlog), updating the in-memory cursor between batches but only
 * persisting the final anchor on success.
 *
 * Each batch (samples + deletes + the cursor upsert at the end of the
 * loop) runs inside a single `db.transaction` so a 500-row pull is one
 * fsync instead of 500. Callbacks receive the tx as a second argument
 * and inner DB writes should route through it.
 */

import { eq } from 'drizzle-orm';

import {
  isHealthDataAvailable,
  queryQuantitySamplesWithAnchor,
  type QuantitySampleTyped,
  type QuantityTypeIdentifier,
  type UnitForIdentifier,
} from '@kingstinct/react-native-healthkit';

import { db, type DbClient } from '@/src/db';
import { hkSyncCursor } from '@/src/db/schema';

export type SyncQuantityResult = {
  /** Sample callback invocations across all paged batches. */
  inserted: number;
  /** Delete callback invocations across all paged batches. */
  deleted: number;
  /** True when the helper was a no-op (HK unavailable or dryRun). */
  skipped: boolean;
  dryRun: boolean;
};

export type SyncQuantityTypeOptions<T extends QuantityTypeIdentifier> = {
  identifier: T;
  unit: UnitForIdentifier<T>;
  /**
   * Max samples per HK call. Default 500. The helper pages internally
   * until a partial batch arrives, so this is a memory-pressure knob
   * rather than a hard cap on total pulled.
   */
  batchSize?: number;
  /**
   * Initial-pull lower bound. Only applied when no anchor exists yet
   * (first sync). Anchored deltas after that always return everything
   * HK considers new, regardless of how old. Bounds protect against a
   * multi-thousand-sample blast on first auth grant.
   */
  since?: Date;
  /**
   * Invoked for each new or updated sample HK returns. Caller maps to a
   * row and persists. The `tx` is the current batch's drizzle
   * transaction — pass it to write functions so they route through the
   * same write. Awaited — keep it cheap, this runs once per sample.
   */
  onSample: (sample: QuantitySampleTyped<T>, tx: DbClient) => Promise<void> | void;
  /**
   * Invoked for each deletion in the delta. UUID only; caller deletes the
   * mirrored row by `healthkit_uuid`. Same `tx` contract as `onSample`.
   */
  onDelete: (uuid: string, tx: DbClient) => Promise<void> | void;
  /**
   * Dry run: invoke callbacks but skip cursor advancement so a follow-up
   * real run replays the same set. Useful for on-device debugging.
   */
  dryRun?: boolean;
};

/** In-flight syncs keyed by identifier — collapses concurrent calls. */
const inFlight = new Map<string, Promise<SyncQuantityResult>>();

export async function syncQuantityType<T extends QuantityTypeIdentifier>(
  opts: SyncQuantityTypeOptions<T>,
): Promise<SyncQuantityResult> {
  if (!isHealthDataAvailable()) {
    return { inserted: 0, deleted: 0, skipped: true, dryRun: !!opts.dryRun };
  }

  const existing = inFlight.get(opts.identifier);
  if (existing) return existing;

  const promise = runSync(opts).finally(() => {
    inFlight.delete(opts.identifier);
  });
  inFlight.set(opts.identifier, promise);
  return promise;
}

async function runSync<T extends QuantityTypeIdentifier>(
  opts: SyncQuantityTypeOptions<T>,
): Promise<SyncQuantityResult> {
  const limit = opts.batchSize ?? 500;
  const cursorRow = await db
    .select()
    .from(hkSyncCursor)
    .where(eq(hkSyncCursor.type, opts.identifier))
    .limit(1);

  // anchor=undefined on first run pulls all existing samples — bounded
  // by `opts.since` when provided.
  const isFirstRun = !cursorRow[0]?.lastAnchor;
  let anchor: string | undefined = cursorRow[0]?.lastAnchor ?? undefined;
  let inserted = 0;
  let deleted = 0;

  // Loop until HK returns a partial batch on both axes — that's the
  // signal we've drained the delta. A *full* batch on either axis means
  // more pages are waiting.
  while (true) {
    const response = await queryQuantitySamplesWithAnchor(opts.identifier, {
      unit: opts.unit,
      anchor,
      limit,
      // DateFilter applied on first-run only. Anchored deltas after that
      // don't filter by date — HK chooses what's new since the anchor.
      filter:
        isFirstRun && opts.since
          ? { date: { startDate: opts.since } }
          : undefined,
    });

    // Each batch runs in a single transaction: callbacks + the cursor
    // upsert at the end go through the same `tx`. Drains the fsync cost.
    await db.transaction(async (tx) => {
      for (const sample of response.samples) {
        await opts.onSample(sample, tx);
        inserted++;
      }
      for (const del of response.deletedSamples) {
        await opts.onDelete(del.uuid, tx);
        deleted++;
      }
      if (!opts.dryRun) {
        const now = new Date();
        await tx
          .insert(hkSyncCursor)
          .values({ type: opts.identifier, lastAnchor: response.newAnchor, lastSyncedAt: now })
          .onConflictDoUpdate({
            target: hkSyncCursor.type,
            set: { lastAnchor: response.newAnchor, lastSyncedAt: now },
          });
      }
    });

    anchor = response.newAnchor;
    if (response.samples.length < limit && response.deletedSamples.length < limit) {
      break;
    }
  }

  return { inserted, deleted, skipped: false, dryRun: !!opts.dryRun };
}

/**
 * Last successful sync time for a given HK type, or null if never synced.
 * Used by settings screens to render "last sync HH:MM" subtitles.
 */
export async function getLastSyncedAt(
  identifier: QuantityTypeIdentifier,
): Promise<Date | null> {
  const row = await db
    .select()
    .from(hkSyncCursor)
    .where(eq(hkSyncCursor.type, identifier))
    .limit(1);
  return row[0]?.lastSyncedAt ?? null;
}
