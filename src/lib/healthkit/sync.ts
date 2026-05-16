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
 */

import { eq } from 'drizzle-orm';

import {
  isHealthDataAvailable,
  queryQuantitySamplesWithAnchor,
  type QuantitySampleTyped,
  type QuantityTypeIdentifier,
  type UnitForIdentifier,
} from '@kingstinct/react-native-healthkit';

import { db } from '@/src/db';
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
   * Invoked for each new or updated sample HK returns. Caller maps to a
   * row and persists. Awaited — keep it cheap, this runs once per sample.
   */
  onSample: (sample: QuantitySampleTyped<T>) => Promise<void> | void;
  /**
   * Invoked for each deletion in the delta. UUID only; caller deletes the
   * mirrored row by `healthkit_uuid`.
   */
  onDelete: (uuid: string) => Promise<void> | void;
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

  // anchor=undefined on first run pulls all existing samples.
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
    });

    for (const sample of response.samples) {
      await opts.onSample(sample);
      inserted++;
    }
    for (const del of response.deletedSamples) {
      await opts.onDelete(del.uuid);
      deleted++;
    }

    anchor = response.newAnchor;
    if (response.samples.length < limit && response.deletedSamples.length < limit) {
      break;
    }
  }

  if (!opts.dryRun && anchor !== undefined) {
    const now = new Date();
    await db
      .insert(hkSyncCursor)
      .values({ type: opts.identifier, lastAnchor: anchor, lastSyncedAt: now })
      .onConflictDoUpdate({
        target: hkSyncCursor.type,
        set: { lastAnchor: anchor, lastSyncedAt: now },
      });
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
