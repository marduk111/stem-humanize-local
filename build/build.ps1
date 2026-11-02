# Builds Stem Humanize for Windows:
#   1. writes version.json
#   2. compiles the native launcher/server  (dist\portable\StemHumanizeServer.exe)
#   3. compiles the installer              (dist\StemHumanizeSetup-<version>.exe)
#   4. writes a portable zip               (dist\StemHumanize-<version>-portable.zip)

param(
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"

$root     = Split-Path -Parent $PSScriptRoot
$build    = Join-Path $root "build"
$dist     = Join-Path $root "dist"
$portable = Join-Path $dist "portable"
$appDir   = Join-Path $portable "app"
$icon     = Join-Path $build "app.ico"
$csc      = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"

$version   = (Get-Content (Join-Path $root "VERSION") -Raw).Trim()
$buildDate = (Get-Date).ToString("yyyy-MM-dd")
$commit    = "unknown"
try { $commit = (& git -C $root rev-parse --short HEAD 2>$null).Trim() } catch { }

if (-not (Test-Path $csc)) { throw "C# compiler not found: $csc" }

Write-Output "== Stem Humanize $version ($buildDate, $commit) =="

# ---------------------------------------------------------------- clean

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Path $portable -Force | Out-Null
New-Item -ItemType Directory -Path $appDir -Force | Out-Null

# ---------------------------------------------------------------- version

$versionJson = [ordered]@{
    version = $version
    build   = $buildDate
    commit  = $commit
    channel = "local"
} | ConvertTo-Json

[System.IO.File]::WriteAllText((Join-Path $root "version.json"), $versionJson, (New-Object System.Text.UTF8Encoding($false)))

# ---------------------------------------------------------------- icon

& (Join-Path $build "make-icon.ps1") -OutPath $icon | Out-Null
Copy-Item $icon (Join-Path $appDir "favicon.ico") -Force

# ---------------------------------------------------------------- app files

$appFiles = @(
    "index.html",
    "main.js",
    "humanize-processor.js",
    "version.json",
    "VERSION",
    "CHANGELOG.md",
    "STATUS.md",
    "README.md"
)

foreach ($f in $appFiles) {
    $src = Join-Path $root $f
    if (-not (Test-Path $src)) { throw "Missing app file: $f" }
    Copy-Item $src (Join-Path $appDir $f) -Force
}

# ---------------------------------------------------------------- server exe

$serverOut = Join-Path $portable "StemHumanizeServer.exe"
$serverArgs = @(
    "/nologo",
    "/target:winexe",
    "/optimize+",
    "/platform:anycpu",
    "/win32icon:$icon",
    "/out:$serverOut",
    "/r:System.dll",
    "/r:System.Core.dll",
    "/r:System.Drawing.dll",
    "/r:System.Windows.Forms.dll",
    (Join-Path $root "launcher\StemHumanizeServer.cs")
)

& $csc $serverArgs
if ($LASTEXITCODE -ne 0) { throw "Server build failed." }
Write-Output ("Server: {0:N0} bytes" -f (Get-Item $serverOut).Length)

# ---------------------------------------------------------------- portable zip

$portableZip = Join-Path $dist ("StemHumanize-{0}-portable.zip" -f $version)
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($portable, $portableZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
Write-Output ("Portable: {0}" -f (Split-Path -Leaf $portableZip))

if ($SkipInstaller) {
    Write-Output "Done (installer skipped)."
    exit 0
}

# ---------------------------------------------------------------- installer

$payloadZip = Join-Path $dist "payload.zip"
[System.IO.Compression.ZipFile]::CreateFromDirectory($portable, $payloadZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

$tempSource = Join-Path $dist "Installer.g.cs"
$source = Get-Content (Join-Path $root "installer\Installer.cs") -Raw
$source = $source.Replace('"__VERSION__"', ('"' + $version + '"'))
[System.IO.File]::WriteAllText($tempSource, $source, (New-Object System.Text.UTF8Encoding($false)))

$setupOut = Join-Path $dist ("StemHumanizeSetup-{0}.exe" -f $version)
$installerArgs = @(
    "/nologo",
    "/target:winexe",
    "/optimize+",
    "/platform:anycpu",
    "/win32icon:$icon",
    "/out:$setupOut",
    "/r:System.dll",
    "/r:System.Core.dll",
    "/r:System.Drawing.dll",
    "/r:System.Windows.Forms.dll",
    "/r:System.IO.Compression.dll",
    "/r:System.IO.Compression.FileSystem.dll",
    "/resource:$payloadZip,Payload.zip",
    $tempSource
)

& $csc $installerArgs
if ($LASTEXITCODE -ne 0) { throw "Installer build failed." }

Remove-Item $tempSource -Force
Write-Output ("Installer: {0} ({1:N0} bytes)" -f (Split-Path -Leaf $setupOut), (Get-Item $setupOut).Length)
Write-Output "Done."
