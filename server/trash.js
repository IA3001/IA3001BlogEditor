import trash from 'trash';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

async function expandForWindowsShell(paths) {
  const files = new Set();
  const directories = new Set();

  async function visit(target) {
    let stat;
    try { stat = await fs.lstat(target); } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (!stat.isDirectory()) {
      files.add(target);
      return;
    }

    for (const entry of await fs.readdir(target, { withFileTypes: true })) {
      await visit(path.join(target, entry.name));
    }
    directories.add(target);
  }

  for (const target of paths) await visit(target);
  return [
    ...files,
    ...[...directories].sort((a, b) => b.length - a.length),
  ];
}

function moveWithWindowsShell(paths) {
  const script = String.raw`
try {
  $ErrorActionPreference = 'Stop'
  Add-Type -AssemblyName Microsoft.VisualBasic
  $paths = [Console]::In.ReadToEnd() | ConvertFrom-Json
  foreach ($path in $paths) {
    if ([System.IO.Directory]::Exists($path)) {
      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($path, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
    } elseif ([System.IO.File]::Exists($path)) {
      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($path, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
    }
  }
} catch {
  [Console]::Out.WriteLine($_.Exception.Message)
  exit 1
}
`;
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64');

  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stdout.trim() || stderr.trim() || `Windows 回收站操作失败（PowerShell exit ${code}）`));
    });
    child.stdin.end(JSON.stringify(paths), 'utf8');
  });
}

/** Move validated absolute paths into the operating system's recycle bin/trash. */
export async function moveToRecycleBin(paths) {
  const uniquePaths = [...new Set((Array.isArray(paths) ? paths : [paths]).filter(Boolean))];
  if (!uniquePaths.length) return;
  try {
    await trash(uniquePaths, { glob: false });
  } catch (error) {
    if (process.platform !== 'win32') throw error;
    // Some Windows shell items return E_UNEXPECTED from trash's native helper.
    // Retry through .NET's Shell recycle operation; never fall back to permanent deletion.
    try {
      await moveWithWindowsShell(await expandForWindowsShell(uniquePaths));
    } catch (fallbackError) {
      fallbackError.cause = error;
      throw fallbackError;
    }
  }
}
