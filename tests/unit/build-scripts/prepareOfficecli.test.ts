import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const {
  getOfficecliAssetName,
  normalizeOfficecliVersion,
  parseOfficecliChecksum,
  pruneBundledOfficecliResources,
  verifyBundledOfficecliResources,
  verifyFileChecksum,
} = require('../../../packages/shared-scripts/src/prepare-officecli.js');

const temporaryDirectories: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'prepare-officecli-test-'));
  temporaryDirectories.push(root);
  return root;
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('OfficeCLI release asset mapping', () => {
  it.each([
    ['win32', 'x64', 'officecli-win-x64.exe'],
    ['win32', 'arm64', 'officecli-win-arm64.exe'],
    ['darwin', 'x64', 'officecli-mac-x64'],
    ['darwin', 'arm64', 'officecli-mac-arm64'],
    ['linux', 'x64', 'officecli-linux-x64'],
    ['linux', 'arm64', 'officecli-linux-arm64'],
  ])('maps %s-%s to its immutable release asset', (platform, arch, expected) => {
    expect(getOfficecliAssetName(platform, arch)).toBe(expected);
  });

  it('rejects unsupported targets and malformed versions', () => {
    expect(() => getOfficecliAssetName('freebsd', 'x64')).toThrow('Unsupported OfficeCLI target');
    expect(() => normalizeOfficecliVersion('latest')).toThrow('Invalid OfficeCLI version');
  });
});

describe('OfficeCLI checksum verification', () => {
  it('parses GNU text and binary checksum rows by exact asset name', () => {
    const hash = 'a'.repeat(64);
    expect(parseOfficecliChecksum(`${hash}  *officecli-win-x64.exe\n`, 'officecli-win-x64.exe')).toBe(hash);
  });

  it('rejects missing and mismatched checksums', () => {
    const root = createRoot();
    const binary = path.join(root, 'officecli');
    writeFileSync(binary, 'binary');
    expect(() => parseOfficecliChecksum(`${'a'.repeat(64)}  other\n`, 'officecli')).toThrow('Checksum entry');
    expect(() => verifyFileChecksum(binary, '0'.repeat(64))).toThrow('checksum mismatch');
  });
});

describe('bundled OfficeCLI resource verification', () => {
  it('accepts a complete bundle and rejects a modified binary', () => {
    const root = createRoot();
    const directory = path.join(root, 'bundled-officecli', 'linux-x64');
    const binary = path.join(directory, 'officecli');
    mkdirSync(directory, { recursive: true });
    writeFileSync(binary, 'binary', { mode: 0o755 });
    chmodSync(binary, 0o755);
    writeFileSync(path.join(directory, 'LICENSE.txt'), 'Apache License');
    const binarySha256 = createHash('sha256').update('binary').digest('hex');
    writeFileSync(
      path.join(directory, 'manifest.json'),
      JSON.stringify({
        name: 'suoak/OfficeCLI',
        version: '1.0.150',
        platform: 'linux',
        arch: 'x64',
        asset: 'officecli-linux-x64',
        binarySha256,
      })
    );

    const valid = verifyBundledOfficecliResources({
      resourcesDir: root,
      electronPlatformName: 'linux',
      targetArch: 'x64',
    });
    expect(valid.missing).toEqual([]);
    expect(valid.errors).toEqual([]);

    writeFileSync(binary, 'tampered');
    const invalid = verifyBundledOfficecliResources({
      resourcesDir: root,
      electronPlatformName: 'linux',
      targetArch: 'x64',
    });
    expect(invalid.errors).toContain('manifest.binarySha256');
  });

  it('removes foreign architectures from the packaged resources', () => {
    const root = createRoot();
    const bundleRoot = path.join(root, 'bundled-officecli');
    mkdirSync(path.join(bundleRoot, 'darwin-arm64'), { recursive: true });
    mkdirSync(path.join(bundleRoot, 'darwin-x64'), { recursive: true });

    pruneBundledOfficecliResources({ resourcesDir: root, electronPlatformName: 'darwin', targetArch: 'arm64' });

    expect(existsSync(path.join(bundleRoot, 'darwin-arm64'))).toBe(true);
    expect(existsSync(path.join(bundleRoot, 'darwin-x64'))).toBe(false);
  });
});
