/**
 * HealthKit authorization helpers.
 *
 * Two surfaces:
 *   • `ensureHkAuthorization(req)` — idempotent: only fires the native
 *     prompt when HK hasn't yet been asked for some part of `req`.
 *     Returns the resolved auth state.
 *   • `useHkAuthState(req)` — reactive hook returning the current state.
 *     Recomputes on mount and on every app-foreground transition (the
 *     user might toggle permissions in Settings.app and come back).
 *
 * The state machine relies entirely on HK's own bookkeeping — we don't
 * persist anything ourselves. `getRequestStatusForAuthorization` already
 * tells us whether the user has been asked, and `authorizationStatusFor`
 * tells us whether write access was granted (Apple's privacy design
 * intentionally hides the read-side result, so we infer "granted" from
 * the write side when both are requested).
 */

import { useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  AuthorizationRequestStatus,
  AuthorizationStatus,
  authorizationStatusFor,
  getRequestStatusForAuthorization,
  isHealthDataAvailable,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import type {
  ObjectTypeIdentifier,
  SampleTypeIdentifierWriteable,
} from '@kingstinct/react-native-healthkit';

export type HkAuthState =
  /** Initial/transient — we haven't determined status yet (one frame on mount). */
  | 'checking'
  /** HK isn't available — iOS Simulator or non-iOS. Treat as "manual entries only". */
  | 'unavailable'
  /** User hasn't responded to the prompt yet for at least one of the requested types. */
  | 'unknown'
  /** All requested write-side types were authorized. (Read-side can't be inspected; we trust the prompt.) */
  | 'granted'
  /** Prompt was answered but at least one write-side type was denied. */
  | 'denied';

export type HkPermissionRequest = {
  /** Types we want to read. HK gives no API to verify the user actually granted these (privacy by design). */
  readonly toRead: readonly ObjectTypeIdentifier[];
  /** Types we want to write. These can be inspected via `authorizationStatusFor`. */
  readonly toShare?: readonly SampleTypeIdentifierWriteable[];
};

/**
 * Resolve the current auth state without prompting. Cheap enough to call
 * on every focus.
 */
export async function getHkAuthState(req: HkPermissionRequest): Promise<HkAuthState> {
  if (!isHealthDataAvailable()) return 'unavailable';

  const status = await getRequestStatusForAuthorization(req);
  if (
    status === AuthorizationRequestStatus.shouldRequest ||
    status === AuthorizationRequestStatus.unknown
  ) {
    return 'unknown';
  }

  // status === unnecessary → user has responded to the prompt. Verify the
  // write side individually; if any write type isn't authorized we treat
  // the whole request as "denied" so callers can show the right banner.
  const writeTypes = req.toShare ?? [];
  if (writeTypes.length === 0) {
    // Read-only request — HK doesn't expose read auth status (Apple's design
    // to prevent apps from inferring whether data exists). Calling code
    // should just attempt the read and handle an empty result.
    return 'granted';
  }
  for (const type of writeTypes) {
    if (authorizationStatusFor(type) !== AuthorizationStatus.sharingAuthorized) {
      return 'denied';
    }
  }
  return 'granted';
}

/**
 * Prompt the user for HK permissions if the system says we still need to.
 * Re-querying state afterwards is what `requestAuthorization`'s boolean
 * doesn't tell us — that boolean only signals "the prompt completed
 * without error", not what the user picked.
 *
 * After the prompt resolves, we notify every active `useHkAuthState`
 * instance so screens reflect the new state without waiting for an
 * app-foreground transition. iOS doesn't background the app for the
 * permission sheet, so nothing else would trigger a refresh.
 */
export async function ensureHkAuthorization(req: HkPermissionRequest): Promise<HkAuthState> {
  if (!isHealthDataAvailable()) return 'unavailable';

  const status = await getRequestStatusForAuthorization(req);
  if (
    status === AuthorizationRequestStatus.shouldRequest ||
    status === AuthorizationRequestStatus.unknown
  ) {
    await requestAuthorization(req);
  }
  const next = await getHkAuthState(req);
  notifyAuthListeners();
  return next;
}

// ─── Pub/sub for "auth state changed" ──────────────────────────────────────
// React's effect machinery can't observe iOS auth changes directly — there's
// no system event. We push a manual notification after `ensureHkAuthorization`
// (and any future call that mutates auth) so subscribed hooks re-poll.

type AuthListener = () => void;
const authListeners = new Set<AuthListener>();

function notifyAuthListeners() {
  for (const fn of authListeners) {
    try {
      fn();
    } catch {
      // Listeners shouldn't throw; swallow so one bad subscriber can't
      // break the rest of the broadcast.
    }
  }
}

/**
 * Reactive view of HK auth state. Recomputes when the app foregrounds so
 * a Settings.app round-trip is reflected without a full reload.
 *
 * Pass a stable `req` object (defined at module level, or memoized) to
 * avoid re-subscribing on every render — the hook stringifies the
 * identifier arrays for change detection but a fresh object reference
 * every render still triggers a state poll.
 */
export function useHkAuthState(req: HkPermissionRequest): HkAuthState {
  const [state, setState] = useState<HkAuthState>('checking');

  // Stable key for the request — joining identifier strings is enough
  // since HK identifiers are constant string literals.
  const reqKey = useMemo(() => {
    const read = [...req.toRead].sort().join(',');
    const share = req.toShare ? [...req.toShare].sort().join(',') : '';
    return `${read}|${share}`;
  }, [req.toRead, req.toShare]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getHkAuthState(req)
        .then((s) => {
          if (!cancelled) setState(s);
        })
        .catch(() => {
          if (!cancelled) setState('unavailable');
        });
    };
    refresh();
    // Two refresh triggers:
    //   1. AppState 'active' — catches "user toggled HK perms in iOS Settings
    //      and returned to the app" (the app actually backgrounds for that).
    //   2. authListeners — fires after `ensureHkAuthorization` resolves,
    //      since the native permission sheet does NOT background the app
    //      and AppState wouldn't transition.
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') refresh();
    });
    authListeners.add(refresh);
    return () => {
      cancelled = true;
      sub.remove();
      authListeners.delete(refresh);
    };
    // reqKey captures req identity for change detection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);

  return state;
}
