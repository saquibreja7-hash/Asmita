param(
  [string]$WorkerName = "asmita-staging"
)

$ErrorActionPreference = "Stop"
$stagingFile = Join-Path $PSScriptRoot "..\.env.staging.local"
$secretNames = @("ENCRYPTION_KEY", "JWT_SECRET", "CSRF_SECRET", "CRON_SECRET")

if (-not (Test-Path $stagingFile)) {
  throw "Run configure-staging-db.ps1 before configuring Worker secrets."
}

function New-HexSecret {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToHexString($bytes).ToLowerInvariant()
}

$secrets = @{}
foreach ($name in $secretNames) {
  $secrets[$name] = New-HexSecret
}

$preserved = Get-Content -LiteralPath $stagingFile | Where-Object {
  $_ -notmatch "^(ENCRYPTION_KEY|JWT_SECRET|CSRF_SECRET|CRON_SECRET)="
}
foreach ($name in $secretNames) {
  $preserved += "$name=$($secrets[$name])"
}
Set-Content -LiteralPath $stagingFile -Value $preserved -Encoding utf8NoBOM

$temporarySecretFile = New-TemporaryFile
try {
  # Prefer the OAuth login over any stale token inherited by this shell.
  Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue

  foreach ($name in $secretNames) {
    Set-Content -LiteralPath $temporarySecretFile -Value $secrets[$name] -NoNewline -Encoding ascii
    Get-Content -LiteralPath $temporarySecretFile -Raw |
      npx wrangler secret put $name --name $WorkerName
  }
} finally {
  Remove-Item -LiteralPath $temporarySecretFile -Force -ErrorAction SilentlyContinue
  $secrets.Clear()
}

Write-Host "Staging Worker secrets configured. Values are stored only in ignored local configuration and Cloudflare."
