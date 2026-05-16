/**
 * HealthKit utilities — auth + sync. Re-export through here so feature
 * code imports from `@/src/lib/healthkit` rather than reaching into the
 * sub-modules.
 */

export {
  ensureHkAuthorization,
  getHkAuthState,
  useHkAuthState,
  type HkAuthState,
  type HkPermissionRequest,
} from './auth';

export {
  syncQuantityType,
  getLastSyncedAt,
  type SyncQuantityResult,
  type SyncQuantityTypeOptions,
} from './sync';

export {
  BODY_MASS_PERMISSIONS,
  logWeight,
  syncWeightFromHealthKit,
} from './weight';
