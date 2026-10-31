param(
  [string]$ProjectRef = "rijfuazecspigawklwuv"
)

$ErrorActionPreference = "Stop"

$securePassword = Read-Host "Supabase database password" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $encodedPassword = [Uri]::EscapeDataString($plainPassword)
  $directUrl = "postgresql://postgres:${encodedPassword}@db.${ProjectRef}.supabase.co:5432/postgres?sslmode=require"
  $target = Join-Path $PSScriptRoot "..\.env.staging.local"

  @(
    "DATABASE_URL=$directUrl"
    "DIRECT_URL=$directUrl"
  ) | Set-Content -LiteralPath $target -Encoding utf8NoBOM

  Write-Host "Staging database configuration saved to ignored .env.staging.local."
} finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }

  $plainPassword = $null
  $encodedPassword = $null
  $directUrl = $null
}
