import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const {
  AioncoreIntegrityError,
  extractArchive,
  getAssetName,
  parseAioncoreChecksum,
  prepareAioncore,
  verifyAioncoreChecksum,
  verifyDownloadedAioncoreRelease,
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
    ['win32', 'x64', 'aioncore-v0.2.14-x86_64-pc-windows-msvc.zip'],
    ['win32', 'arm64', 'aioncore-v0.2.14-aarch64-pc-windows-msvc.zip'],
    ['darwin', 'x64', 'aioncore-v0.2.14-x86_64-apple-darwin.tar.gz'],
    ['darwin', 'arm64', 'aioncore-v0.2.14-aarch64-apple-darwin.tar.gz'],
    ['linux', 'x64', 'aioncore-v0.2.14-x86_64-unknown-linux-gnu.tar.gz'],
    ['linux', 'arm64', 'aioncore-v0.2.14-aarch64-unknown-linux-gnu.tar.gz'],
  ])('maps %s-%s to its release asset', (platform, arch, expected) => {
    expect(getAssetName(platform, arch, 'v0.2.14')).toBe(expected);
  });

  it('rejects unsupported targets', () => {
    expect(getAssetName('freebsd', 'x64', 'v0.2.14')).toBeNull();
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

  it('fails closed for a missing checksum file', () => {
    const root = createRoot();
    const archive = path.join(root, 'aioncore.zip');
    writeFileSync(archive, 'archive');

    expect(() =>
      verifyDownloadedAioncoreRelease(path.join(root, 'missing-checksums.txt'), archive, 'aioncore.zip')
    ).toThrow(AioncoreIntegrityError);
  });

  it('fails closed for a missing artifact row and invalid checksum format', () => {
    const root = createRoot();
    const archive = path.join(root, 'aioncore.zip');
    const checksums = path.join(root, 'aioncore-checksums.txt');
    writeFileSync(archive, 'archive');

    writeFileSync(checksums, `${'a'.repeat(64)}  other.zip\n`);
    expect(() => verifyDownloadedAioncoreRelease(checksums, archive, 'aioncore.zip')).toThrow(AioncoreIntegrityError);

    writeFileSync(checksums, `not-a-sha256  aioncore.zip\n`);
    expect(() => verifyDownloadedAioncoreRelease(checksums, archive, 'aioncore.zip')).toThrow(AioncoreIntegrityError);
  });

  it('does not fall back to an unverified local binary after an integrity failure', () => {
    const root = createRoot();
    const localBinary = path.join(root, 'aioncore.exe');
    writeFileSync(localBinary, 'unverified local fallback');
    const previousLocalBinary = process.env.CSBU_WORKMATE_BACKEND_LOCAL_BINARY;
    process.env.CSBU_WORKMATE_BACKEND_LOCAL_BINARY = localBinary;

    try {
      expect(() =>
        prepareAioncore({
          projectRoot: root,
          platform: 'win32',
          arch: 'x64',
          version: 'v0.2.14',
          downloadRelease: () => {
            throw new AioncoreIntegrityError('checksum file missing');
          },
        })
      ).toThrow('checksum file missing');
    } finally {
      if (previousLocalBinary === undefined) delete process.env.CSBU_WORKMATE_BACKEND_LOCAL_BINARY;
      else process.env.CSBU_WORKMATE_BACKEND_LOCAL_BINARY = previousLocalBinary;
    }
  });

  it('accepts the exact archive digest', () => {
    const root = createRoot();
    const archive = path.join(root, 'aioncore.zip');
    writeFileSync(archive, 'archive');
    const expected = createHash('sha256').update('archive').digest('hex');
    expect(verifyAioncoreChecksum(archive, expected)).toBe(expected);
  });
});

type ExtractExecCall = { command: string; args: string[] };

function usedBrokenPowershellExpandArchive(calls: ExtractExecCall[]): boolean {
  return calls.some(
    (call) =>
      call.command === 'powershell' && call.args.some((arg) => arg.includes('Expand-Archive') && arg.includes('-Force'))
  );
}

describe('AionCore archive extraction', () => {
  it('extracts win32 zip archives with tar -xf', () => {
    const root = createRoot();
    const archive = path.join(root, 'aioncore.zip');
    const outputDir = path.join(root, 'out');
    writeFileSync(archive, 'archive');
    const calls: ExtractExecCall[] = [];

    extractArchive(archive, outputDir, 'win32', {
      execFileSync: (command: string, args: string[]) => {
        calls.push({ command, args });
      },
    });

    expect(calls).toEqual([{ command: 'tar', args: ['-xf', archive, '-C', outputDir] }]);
    expect(usedBrokenPowershellExpandArchive(calls)).toBe(false);
  });

  it('falls back to pwsh when tar cannot extract a win32 zip, without powershell Expand-Archive -Force', () => {
    const root = createRoot();
    const archive = path.join(root, 'aioncore.zip');
    const outputDir = path.join(root, 'out');
    writeFileSync(archive, 'archive');
    const calls: ExtractExecCall[] = [];

    extractArchive(archive, outputDir, 'win32', {
      execFileSync: (command: string, args: string[]) => {
        calls.push({ command, args });
        if (command === 'tar') throw new Error('tar unavailable');
      },
    });

    expect(calls[0]).toEqual({ command: 'tar', args: ['-xf', archive, '-C', outputDir] });
    expect(calls[1]?.command).toBe('pwsh');
    expect(calls.some((call) => call.command === 'powershell')).toBe(false);
    expect(usedBrokenPowershellExpandArchive(calls)).toBe(false);
  });

  it('falls back to .NET ZipFile when tar and pwsh fail, without powershell Expand-Archive -Force', () => {
    const root = createRoot();
    const archive = path.join(root, 'aioncore.zip');
    const outputDir = path.join(root, 'out');
    writeFileSync(archive, 'archive');
    const calls: ExtractExecCall[] = [];

    extractArchive(archive, outputDir, 'win32', {
      execFileSync: (command: string, args: string[]) => {
        calls.push({ command, args });
        if (command === 'tar' || command === 'pwsh') throw new Error(`${command} unavailable`);
      },
    });

    expect(calls.map((call) => call.command)).toEqual(['tar', 'pwsh', 'powershell']);
    expect(calls[2]?.args.some((arg) => arg.includes('ZipFile') && arg.includes('ExtractToDirectory'))).toBe(true);
    expect(usedBrokenPowershellExpandArchive(calls)).toBe(false);
  });

  it('extracts non-win32 zip archives with unzip', () => {
    const root = createRoot();
    const archive = path.join(root, 'aioncore.zip');
    const outputDir = path.join(root, 'out');
    writeFileSync(archive, 'archive');
    const calls: ExtractExecCall[] = [];

    extractArchive(archive, outputDir, 'darwin', {
      execFileSync: (command: string, args: string[]) => {
        calls.push({ command, args });
      },
    });

    expect(calls).toEqual([{ command: 'unzip', args: ['-o', archive, '-d', outputDir] }]);
  });

  it('extracts tar.gz archives with tar -xzf', () => {
    const root = createRoot();
    const archive = path.join(root, 'aioncore.tar.gz');
    const outputDir = path.join(root, 'out');
    writeFileSync(archive, 'archive');
    const calls: ExtractExecCall[] = [];

    extractArchive(archive, outputDir, 'linux', {
      execFileSync: (command: string, args: string[]) => {
        calls.push({ command, args });
      },
    });

    expect(calls).toEqual([{ command: 'tar', args: ['-xzf', archive, '-C', outputDir] }]);
  });
});
