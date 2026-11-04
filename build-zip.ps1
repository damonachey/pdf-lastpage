# Creates dist/pdf-lastpage-<version>.zip for uploading to the Chrome Web Store.
# Run from any folder: ./build-zip.ps1

$ErrorActionPreference = "Stop"

# Only these files and folders are shipped. Add new runtime files here.
$include = @(
  "manifest.json",
  "LICENSE",
  "popup.html",
  "popup.css",
  "popup.js",
  "viewer.js",
  "pdf-title.js",
  "icons",
  "pdfjs"
)

$root = $PSScriptRoot
$version = (Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json).version
$distDir = Join-Path $root "dist"
$zipPath = Join-Path $distDir "pdf-lastpage-$version.zip"

$files = foreach ($item in $include) {
  $path = Join-Path $root $item

  # -Recurse on a file path would also match same-named files in subfolders.
  if (Test-Path $path -PathType Container) {
    Get-ChildItem $path -File -Recurse
  } else {
    Get-Item $path
  }
}

New-Item -ItemType Directory -Force $distDir | Out-Null
if (Test-Path $zipPath) {
  Remove-Item $zipPath
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    # Zip entries must use forward slashes on every platform.
    $entryName = $file.FullName.Substring($root.Length + 1).Replace("\", "/")
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entryName) | Out-Null
  }
} finally {
  $zip.Dispose()
}

$sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Output "Created $zipPath ($($files.Count) files, $sizeMb MB)"
