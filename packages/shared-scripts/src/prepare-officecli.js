/** Prepare the CSBU WorkMate OfficeCLI fork for desktop packaging. */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GITHUB_OWNER = 'suoak';
const GITHUB_REPO = 'OfficeCLI';
const ASSET_NAMES = {
  'darwin-arm64': 'officecli-mac-arm64',
  'darwin-x64': 'officecli-mac-x64',
  'linux-arm64': 'officecli-linux-arm64',
  'linux-x64': 'officecli-linux-x64',
  'win32-arm64': 'officecli-win-arm64.exe',
  'win32-x64': 'officecli-win-x64.exe',
};

function normalizeOfficecliVersion(version) {
  const normalized = String(version || '')
    .trim()
    .replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalized)) {
    throw new Error(`Invalid OfficeCLI version: ${version}`);
  }
  return normalized;
}

function getOfficecliBinaryName(platform) {
  return platform === 'win32' ? 'officecli.exe' : 'officecli';
}

function getOfficecliAssetName(platform, arch) {
  const runtimeKey = `${platform}-${arch}`;
  const assetName = ASSET_NAMES[runtimeKey];
  if (!assetName) throw new Error(`Unsupported OfficeCLI target: ${runtimeKey}`);
  return assetName;
}

function parseOfficecliChecksum(checksums, assetName) {
  for (const line of checksums.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (match?.[2] === assetName) return match[1].toLowerCase();
  }
  throw new Error(`Checksum entry not found for ${assetName}`);
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(64 * 1024);
    let bytesRead;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function verifyFileChecksum(filePath, expectedChecksum) {
  const actualChecksum = sha256File(filePath);
  if (actualChecksum !== expectedChecksum.toLowerCase()) {
    throw new Error(
      `OfficeCLI checksum mismatch for ${path.basename(filePath)}: expected ${expectedChecksum}, got ${actualChecksum}`
    );
  }
  return actualChecksum;
}

function downloadFile(url, outputPath) {
  execFileSync(
    'curl',
    [
      '--fail',
      '--location',
      '--silent',
      '--show-error',
      '--connect-timeout',
      '10',
      '--max-time',
      '300',
      url,
      '-o',
      outputPath,
    ],
    { stdio: 'inherit' }
  );
}

function verifyBundledOfficecliResources({ resourcesDir, electronPlatformName, targetArch }) {
  const runtimeKey = `${electronPlatformName}-${targetArch}`;
  const bundleDir = path.join(resourcesDir, 'bundled-officecli', runtimeKey);
  const binaryPath = path.join(bundleDir, getOfficecliBinaryName(electronPlatformName));
  const licensePath = path.join(bundleDir, 'LICENSE.txt');
  const manifestPath = path.join(bundleDir, 'manifest.json');
  const required = [binaryPath, licensePath, manifestPath];
  const missing = required.filter((entry) => !fs.existsSync(entry));
  const errors = [];

  if (missing.length === 0) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const expectedAsset = getOfficecliAssetName(electronPlatformName, targetArch);
      if (manifest.name !== 'suoak/OfficeCLI') errors.push('manifest.name');
      if (manifest.platform !== electronPlatformName) errors.push('manifest.platform');
      if (manifest.arch !== targetArch) errors.push('manifest.arch');
      if (manifest.asset !== expectedAsset) errors.push('manifest.asset');
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version || '')) errors.push('manifest.version');
      if (manifest.binarySha256 !== sha256File(binaryPath)) errors.push('manifest.binarySha256');
      if (
        electronPlatformName !== 'win32' &&
        process.platform !== 'win32' &&
        (fs.statSync(binaryPath).mode & 0o111) === 0
      ) {
        errors.push('binary.executable');
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return { runtimeKey, bundleDir, checked: required, missing, errors };
}

function pruneBundledOfficecliResources({ resourcesDir, electronPlatformName, targetArch }) {
  const runtimeKey = `${electronPlatformName}-${targetArch}`;
  const bundleRoot = path.join(resourcesDir, 'bundled-officecli');
  if (!fs.existsSync(bundleRoot)) return;
  for (const entry of fs.readdirSync(bundleRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== runtimeKey) {
      fs.rmSync(path.join(bundleRoot, entry.name), { recursive: true, force: true });
    }
  }
}

function prepareOfficecli({ projectRoot, platform, arch, version }) {
  const normalizedVersion = normalizeOfficecliVersion(version);
  const runtimeKey = `${platform}-${arch}`;
  const assetName = getOfficecliAssetName(platform, arch);
  const binaryName = getOfficecliBinaryName(platform);
  const releaseBase = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${normalizedVersion}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csbu-workmate-officecli-'));
  const assetPath = path.join(tempDir, assetName);
  const checksumsPath = path.join(tempDir, 'SHA256SUMS');
  const licensePath = path.join(tempDir, 'LICENSE.txt');
  const bundleRoot = path.join(projectRoot, 'resources', 'bundled-officecli');
  const targetDir = path.join(bundleRoot, runtimeKey);

  console.log(`Preparing OfficeCLI for ${runtimeKey} (version: v${normalizedVersion})`);
  try {
    downloadFile(`${releaseBase}/SHA256SUMS`, checksumsPath);
    downloadFile(`${releaseBase}/${assetName}`, assetPath);
    downloadFile(
      `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/v${normalizedVersion}/LICENSE`,
      licensePath
    );
    const expectedChecksum = parseOfficecliChecksum(fs.readFileSync(checksumsPath, 'utf8'), assetName);
    const binarySha256 = verifyFileChecksum(assetPath, expectedChecksum);

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });
    const targetBinary = path.join(targetDir, binaryName);
    fs.copyFileSync(assetPath, targetBinary);
    fs.copyFileSync(licensePath, path.join(targetDir, 'LICENSE.txt'));
    if (platform !== 'win32') fs.chmodSync(targetBinary, 0o755);
    fs.writeFileSync(
      path.join(targetDir, 'manifest.json'),
      `${JSON.stringify(
        {
          name: `${GITHUB_OWNER}/${GITHUB_REPO}`,
          version: normalizedVersion,
          platform,
          arch,
          asset: assetName,
          binarySha256,
          source: `${releaseBase}/${assetName}`,
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    const verification = verifyBundledOfficecliResources({
      resourcesDir: path.join(projectRoot, 'resources'),
      electronPlatformName: platform,
      targetArch: arch,
    });
    if (verification.missing.length > 0 || verification.errors.length > 0) {
      throw new Error(
        `Prepared OfficeCLI bundle is invalid: ${[...verification.missing, ...verification.errors].join(', ')}`
      );
    }
    console.log(`  Bundled OfficeCLI prepared: resources/bundled-officecli/${runtimeKey}/${binaryName}`);
    return { prepared: true, dir: targetDir, version: normalizedVersion };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  getOfficecliAssetName,
  getOfficecliBinaryName,
  normalizeOfficecliVersion,
  parseOfficecliChecksum,
  prepareOfficecli,
  pruneBundledOfficecliResources,
  verifyBundledOfficecliResources,
  verifyFileChecksum,
};
