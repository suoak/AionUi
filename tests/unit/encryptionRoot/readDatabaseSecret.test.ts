/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sqlite = vi.hoisted(() => ({
  ctor: vi.fn(),
  get: vi.fn(),
  close: vi.fn(),
  prepare: vi.fn(),
}));

vi.mock('node:fs', () => ({ existsSync: vi.fn(() => true) }));
vi.mock('better-sqlite3', () => ({
  default: class {
    constructor(...args: unknown[]) {
      sqlite.ctor(...args);
    }
    prepare(sql: string) {
      sqlite.prepare(sql);
      return { get: sqlite.get };
    }
    close() {
      sqlite.close();
    }
  },
}));

import { existsSync } from 'node:fs';
import { readDatabaseEncryptionSecret } from '@process/services/encryptionRoot/readDatabaseSecret';

describe('readDatabaseEncryptionSecret', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('opens the backend database read-only and returns the system user secret', () => {
    sqlite.get.mockReturnValue({ encryption_secret: 'db-secret' });
    expect(readDatabaseEncryptionSecret('/data')).toBe('db-secret');
    expect(sqlite.ctor).toHaveBeenCalledWith(expect.stringMatching(/aionui-backend\.db$/), {
      readonly: true,
      fileMustExist: true,
    });
    expect(sqlite.prepare).toHaveBeenCalledWith("SELECT encryption_secret FROM users WHERE id = 'system_default_user'");
    expect(sqlite.close).toHaveBeenCalled();
  });

  it('returns null for a missing file, empty column, or query failure', () => {
    vi.mocked(existsSync).mockReturnValueOnce(false);
    expect(readDatabaseEncryptionSecret('/data')).toBeNull();
    expect(sqlite.ctor).not.toHaveBeenCalled();

    sqlite.get.mockReturnValueOnce({ encryption_secret: null });
    expect(readDatabaseEncryptionSecret('/data')).toBeNull();

    sqlite.get.mockImplementationOnce(() => {
      throw new Error('no such column: encryption_secret');
    });
    expect(readDatabaseEncryptionSecret('/data')).toBeNull();
    expect(sqlite.close).toHaveBeenCalledTimes(2);
  });
});
