/**
 * Extract a downloaded release archive with host-appropriate tools.
 *
 * Windows zip extraction must not use Windows PowerShell 5.1 `Expand-Archive -Force`.
 * On GitHub Actions windows-latest, `powershell` can load PowerShell 7's
 * Microsoft.PowerShell.Archive module via PSModulePath, which calls the 3-arg
 * [System.IO.Compression.ZipFileExtensions]::ExtractToDirectory(..., $true)
 * overload that does not exist in .NET Framework 4.8.
 *
 * Preferred Windows zip path: built-in bsdtar (`tar -xf`), available as
 * System32\tar.exe on Windows 10 1803+ / Server 2019+. Fall back to pwsh
 * (PowerShell 7, .NET Core) or the 2-arg ZipFile.ExtractToDirectory API.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');

function commandError(command, error) {
  const detail = error && (error.stderr || error.message || String(error));
  return `${command}: ${detail}`;
}

function withExtractEnv(execOptions, archivePath, outputDir) {
  return {
    ...execOptions,
    env: {
      ...(execOptions.env || process.env),
      EXTRACT_ARCHIVE: archivePath,
      EXTRACT_DEST: outputDir,
    },
  };
}

function extractZipWithPwsh(archivePath, outputDir, runFile, execOptions) {
  // pwsh is PowerShell 7+ (.NET Core), where Expand-Archive -Force is valid.
  runFile(
    'pwsh',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath $env:EXTRACT_ARCHIVE -DestinationPath $env:EXTRACT_DEST -Force",
    ],
    withExtractEnv(execOptions, archivePath, outputDir)
  );
}

function extractZipWithDotNetZipFile(archivePath, outputDir, runFile, execOptions) {
  // The 2-arg overload exists on .NET Framework 4.5+ (Windows PowerShell 5.1)
  // and does not require the 3-arg overwrite overload added in .NET Core.
  runFile(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:EXTRACT_ARCHIVE, $env:EXTRACT_DEST)",
    ],
    withExtractEnv(execOptions, archivePath, outputDir)
  );
}

function extractWindowsZip(archivePath, outputDir, runFile, execOptions) {
  const errors = [];

  try {
    runFile('tar', ['-xf', archivePath, '-C', outputDir], execOptions);
    return;
  } catch (error) {
    errors.push(commandError('tar', error));
  }

  try {
    extractZipWithPwsh(archivePath, outputDir, runFile, execOptions);
    return;
  } catch (error) {
    errors.push(commandError('pwsh', error));
  }

  try {
    extractZipWithDotNetZipFile(archivePath, outputDir, runFile, execOptions);
    return;
  } catch (error) {
    errors.push(commandError('powershell ZipFile.ExtractToDirectory', error));
  }

  throw new Error(
    `Failed to extract Windows zip "${archivePath}" into "${outputDir}". Tried tar -xf, pwsh Expand-Archive, and [System.IO.Compression.ZipFile]::ExtractToDirectory. ${errors.join(' | ')}`
  );
}

function extractArchive(archivePath, outputDir, platform, options = {}) {
  const runFile = options.execFileSync || execFileSync;
  const execOptions = options.execOptions || {};
  fs.mkdirSync(outputDir, { recursive: true });

  const isZip = archivePath.endsWith('.zip') || platform === 'win32';
  if (!isZip) {
    runFile('tar', ['-xzf', archivePath, '-C', outputDir], execOptions);
    return;
  }

  if (platform === 'win32') {
    extractWindowsZip(archivePath, outputDir, runFile, execOptions);
    return;
  }

  runFile('unzip', ['-o', archivePath, '-d', outputDir], execOptions);
}

module.exports = {
  extractArchive,
};
