/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'node:fs';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

/** Backend database file inside the data dir (AionCore `AppConfig::database_path`). */
export const BACKEND_DATABASE_FILE = 'aionui-backend.db';

/**
 * Read `users.encryption_secret` of the desktop system user, read-only.
 *
 * Called only while no backend owns the data dir (right before spawn). Never
 * writes; any failure (missing file, older schema, locked database) returns
 * null so the caller sends nothing and the backend keeps its own value.
 */
export function readDatabaseEncryptionSecret(dataDir: string): string | null {
  const file = path.join(dataDir, BACKEND_DATABASE_FILE);
  if (!existsSync(file)) return null;
  let db: BetterSqlite3.Database | null = null;
  try {
    db = new BetterSqlite3(file, { readonly: true, fileMustExist: true });
    const row = db.prepare("SELECT encryption_secret FROM users WHERE id = 'system_default_user'").get() as
      | { encryption_secret?: unknown }
      | undefined;
    const value = row?.encryption_secret;
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  } finally {
    try {
      db?.close();
    } catch {
      // ignore
    }
  }
}
