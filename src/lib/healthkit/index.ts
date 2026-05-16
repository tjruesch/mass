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
  syncWorkoutType,
  getLastSyncedAt,
  WORKOUTS_CURSOR_KEY,
  type SyncQuantityResult,
  type SyncQuantityTypeOptions,
  type SyncWorkoutsOptions,
} from './sync';

export {
  BODY_MASS_PERMISSIONS,
  logWeight,
  syncWeightFromHealthKit,
} from './weight';

export {
  WORKOUT_PERMISSIONS,
  logWorkout,
  syncWorkoutsFromHealthKit,
} from './workouts';
