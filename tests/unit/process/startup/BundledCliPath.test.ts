import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  activateBundledOfficecli,
  prependBundledLarkCliToPath,
  prependPreferredLarkCliToPath,
} from '@/process/startup/bundledCliPath';

const temporaryDirectories: string[] = [];

function createResourcesRoot(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'bundled-cli-path-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('bundled Lark CLI PATH setup', () => {
  it('prepends the bundled binary directory for packaged Windows builds', () => {
    const resourcesPath = createResourcesRoot();
    const bundleDirectory = path.join(resourcesPath, 'bundled-lark-cli', 'win32-x64');
    mkdirSync(bundleDirectory, { recursive: true });
    writeFileSync(path.join(bundleDirectory, 'lark-cli.exe'), 'binary');
    const env: NodeJS.ProcessEnv = { PATH: 'C:\\Windows\\System32' };

    expect(
      prependBundledLarkCliToPath({
        isPackaged: true,
        resourcesPath,
        cwd: resourcesPath,
        platform: 'win32',
        arch: 'x64',
        env,
      })
    ).toBe(bundleDirectory);
    expect(env.PATH?.split(path.delimiter)[0]).toBe(bundleDirectory);
    expect(env.Path).toBe(env.PATH);
  });

  it('does not modify PATH when the bundled binary is missing', () => {
    const resourcesPath = createResourcesRoot();
    const env: NodeJS.ProcessEnv = { PATH: 'existing' };
    expect(
      prependBundledLarkCliToPath({
        isPackaged: true,
        resourcesPath,
        cwd: resourcesPath,
        platform: 'linux',
        arch: 'x64',
        env,
      })
    ).toBeNull();
    expect(env.PATH).toBe('existing');
  });

  it('does not duplicate an existing bundled directory', () => {
    const resourcesPath = createResourcesRoot();
    const bundleDirectory = path.join(resourcesPath, 'bundled-lark-cli', 'linux-x64');
    mkdirSync(bundleDirectory, { recursive: true });
    writeFileSync(path.join(bundleDirectory, 'lark-cli'), 'binary');
    const env: NodeJS.ProcessEnv = { PATH: `${bundleDirectory}${path.delimiter}/usr/bin` };

    prependBundledLarkCliToPath({
      isPackaged: true,
      resourcesPath,
      cwd: resourcesPath,
      platform: 'linux',
      arch: 'x64',
      env,
    });
    expect(env.PATH?.split(path.delimiter).filter((entry) => entry === bundleDirectory)).toHaveLength(1);
  });

  it('prefers a managed version whose binary checksum is valid', () => {
    const resourcesPath = createResourcesRoot();
    const userDataPath = createResourcesRoot();
    const runtimeKey = 'win32-x64';
    const managedDirectory = path.join(userDataPath, 'tools', 'lark-cli', '1.0.86', runtimeKey);
    const bundledDirectory = path.join(resourcesPath, 'bundled-lark-cli', runtimeKey);
    mkdirSync(managedDirectory, { recursive: true });
    mkdirSync(bundledDirectory, { recursive: true });
    writeFileSync(path.join(bundledDirectory, 'lark-cli.exe'), 'bundled');
    writeFileSync(path.join(managedDirectory, 'lark-cli.exe'), 'managed');
    writeFileSync(
      path.join(managedDirectory, 'manifest.json'),
      JSON.stringify({
        version: '1.0.86',
        runtimeKey,
        binarySha256: createHash('sha256').update('managed').digest('hex'),
      })
    );
    writeFileSync(
      path.join(userDataPath, 'tools', 'lark-cli', 'active.json'),
      JSON.stringify({ version: '1.0.86', runtimeKey })
    );
    const env: NodeJS.ProcessEnv = { PATH: bundledDirectory };

    const active = prependPreferredLarkCliToPath({
      isPackaged: true,
      resourcesPath,
      cwd: resourcesPath,
      userDataPath,
      platform: 'win32',
      arch: 'x64',
      env,
    });

    expect(active).toEqual({ directory: managedDirectory, source: 'managed', version: '1.0.86' });
    expect(env.PATH?.split(path.delimiter)[0]).toBe(managedDirectory);
    expect(env.PATH).not.toContain(bundledDirectory);
  });

  it('falls back to the bundled version when the managed binary was modified', () => {
    const resourcesPath = createResourcesRoot();
    const userDataPath = createResourcesRoot();
    const runtimeKey = 'linux-x64';
    const managedDirectory = path.join(userDataPath, 'tools', 'lark-cli', '1.0.86', runtimeKey);
    const bundledDirectory = path.join(resourcesPath, 'bundled-lark-cli', runtimeKey);
    mkdirSync(managedDirectory, { recursive: true });
    mkdirSync(bundledDirectory, { recursive: true });
    writeFileSync(path.join(bundledDirectory, 'lark-cli'), 'bundled');
    writeFileSync(path.join(bundledDirectory, 'manifest.json'), JSON.stringify({ version: '1.0.85' }));
    writeFileSync(path.join(managedDirectory, 'lark-cli'), 'tampered');
    writeFileSync(
      path.join(managedDirectory, 'manifest.json'),
      JSON.stringify({ version: '1.0.86', runtimeKey, binarySha256: '0'.repeat(64) })
    );
    writeFileSync(
      path.join(userDataPath, 'tools', 'lark-cli', 'active.json'),
      JSON.stringify({ version: '1.0.86', runtimeKey })
    );
    const env: NodeJS.ProcessEnv = { PATH: managedDirectory };

    const active = prependPreferredLarkCliToPath({
      isPackaged: true,
      resourcesPath,
      cwd: resourcesPath,
      userDataPath,
      platform: 'linux',
      arch: 'x64',
      env,
    });

    expect(active).toEqual({ directory: bundledDirectory, source: 'bundled', version: '1.0.85' });
    expect(env.PATH?.split(path.delimiter)[0]).toBe(bundledDirectory);
    expect(env.PATH).not.toContain(managedDirectory);
  });
});

describe('bundled OfficeCLI activation', () => {
  function writeOfficecliBundle(resourcesPath: string, binary = 'officecli-binary'): string {
    const directory = path.join(resourcesPath, 'bundled-officecli', 'win32-x64');
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'officecli.exe'), binary);
    writeFileSync(
      path.join(directory, 'manifest.json'),
      JSON.stringify({
        name: 'suoak/OfficeCLI',
        version: '1.0.150',
        platform: 'win32',
        arch: 'x64',
        binarySha256: createHash('sha256').update(binary).digest('hex'),
      })
    );
    return directory;
  }

  it('activates a verified desktop bundle before spawning AionCore', () => {
    const resourcesPath = createResourcesRoot();
    const directory = writeOfficecliBundle(resourcesPath);
    const env: NodeJS.ProcessEnv = { PATH: 'C:\\Windows\\System32' };

    const active = activateBundledOfficecli({
      isPackaged: true,
      resourcesPath,
      cwd: resourcesPath,
      platform: 'win32',
      arch: 'x64',
      env,
    });

    expect(active).toMatchObject({ active: true, directory, version: '1.0.150' });
    expect(env.CSBU_WORKMATE_OFFICECLI_MODE).toBe('bundled');
    expect(env.PATH?.split(path.delimiter)[0]).toBe(directory);
  });

  it('fails closed and keeps an unverified binary out of PATH', () => {
    const resourcesPath = createResourcesRoot();
    writeOfficecliBundle(resourcesPath);
    writeFileSync(path.join(resourcesPath, 'bundled-officecli', 'win32-x64', 'officecli.exe'), 'tampered');
    const env: NodeJS.ProcessEnv = { PATH: 'trusted-path' };

    const active = activateBundledOfficecli({
      isPackaged: true,
      resourcesPath,
      cwd: resourcesPath,
      platform: 'win32',
      arch: 'x64',
      env,
    });

    expect(active).toEqual({ active: false, reason: 'checksumMismatch' });
    expect(env.CSBU_WORKMATE_OFFICECLI_MODE).toBe('bundled');
    expect(env.PATH).toBe('trusted-path');
  });

  it('marks a missing packaged bundle as managed without falling back to PATH', () => {
    const resourcesPath = createResourcesRoot();
    const env: NodeJS.ProcessEnv = { PATH: 'external-officecli-path' };

    const active = activateBundledOfficecli({
      isPackaged: true,
      resourcesPath,
      cwd: resourcesPath,
      platform: 'linux',
      arch: 'arm64',
      env,
    });

    expect(active).toEqual({ active: false, reason: 'missingBinary' });
    expect(env.CSBU_WORKMATE_OFFICECLI_MODE).toBe('bundled');
    expect(env.PATH).toBe('external-officecli-path');
  });

  it('leaves development environments unchanged when no bundle is prepared', () => {
    const resourcesPath = createResourcesRoot();
    const env: NodeJS.ProcessEnv = { PATH: 'developer-path' };

    const active = activateBundledOfficecli({
      isPackaged: false,
      resourcesPath,
      cwd: resourcesPath,
      platform: 'linux',
      arch: 'x64',
      env,
    });

    expect(active).toBeNull();
    expect(env.CSBU_WORKMATE_OFFICECLI_MODE).toBeUndefined();
    expect(env.PATH).toBe('developer-path');
  });
});
