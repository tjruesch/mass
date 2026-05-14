/**
 * Single point of entry for the local DB.
 *
 * Open one SQLite connection for the whole app and attach Drizzle to it.
 * Migrations are bundled at build time (see migrations/migrations.js) and
 * applied at startup via `useMigrations` in app/_layout.tsx.
 */

import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { openDatabaseSync } from 'expo-sqlite';

import migrations from './migrations/migrations';
import * as schema from './schema';

const expoDb = openDatabaseSync('mass.db', { enableChangeListener: true });

export const db = drizzle(expoDb, { schema, casing: 'snake_case' });

export type Db = typeof db;

export { migrations, useMigrations };
