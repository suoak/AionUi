import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const {
  getAssetName,
  parseAioncoreChecksum,
  verifyAioncoreChecksum,
} = require('../../../packages/shared-scripts/src/prepare-aioncore.js');

const temporaryDirectories: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'prepare-aioncore-test-'));
  temporaryDirectories.push(root);
  return root;
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('AionCore release asset mapping', () => {
  it.each([
    ['win32', 'x64', 'aioncore-v0.2.13-x86_64-pc-windows-msvc.zip'],
    ['win32', 'arm64', 'aioncore-v0.2.13-aarch64-pc-windows-msvc.zip'],
    ['darwin', 'x64', 'aioncore-v0.2.13-x86_64-apple-darwin.tar.gz'],
    ['darwin', 'arm64', 'aioncore-v0.2.13-aarch64-apple-darwin.tar.gz'],
    ['linux', 'x64', 'aioncore-v0.2.13-x86_64-unknown-linux-gnu.tar.gz'],
    ['linux', 'arm64', 'aioncore-v0.2.13-aarch64-unknown-linux-gnu.tar.gz'],
  ])('maps %s-%s to its release asset', (platform, arch, expected) => {
    expect(getAssetName(platform, arch, 'v0.2.13')).toBe(expected);
  });

  it('rejects unsupported targets', () => {
    expect(getAssetName('freebsd', 'x64', 'v0.2.13')).toBeNull();
  });
});

describe('AionCore checksum verification', () => {
  it('parses GNU text and binary checksum rows by exact asset name', () => {
    const hash = 'a'.repeat(64);
    expect(parseAioncoreChecksum(`${hash}  *aioncore.zip\n`, 'aioncore.zip')).toBe(hash);
  });

  it('rejects missing and mismatched checksums', () => {
    const root = createRoot();
    const archive = path.join(root, 'aioncore.zip');
    writeFileSync(archive, 'archive');
    expect(() => parseAioncoreChecksum(`${'a'.repeat(64)}  other.zip\n`, 'aioncore.zip')).toThrow('Checksum entry');
    expect(() => verifyAioncoreChecksum(archive, '0'.repeat(64))).toThrow('checksum mismatch');
  });

  it('accepts the exact archive digest', () => {
    const root = createRoot();
    const archive = path.join(root, 'aioncore.zip');
    writeFileSync(archive, 'archive');
    const expected = createHash('sha256').update('archive').digest('hex');
    expect(verifyAioncoreChecksum(archive, expected)).toBe(expected);
  });
});
