$ErrorActionPreference = 'Stop'
$email = Read-Host 'Existing owner email'
$securePassword = Read-Host 'New owner password (12+ characters)' -AsSecureString
$passwordPointer = [IntPtr]::Zero
$password = $null
$locationPushed = $false

try {
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  if ($password.Length -lt 12 -or $password.Length -gt 128) {
    throw 'New owner password must be between 12 and 128 characters.'
  }

  $env:CODEMARKET_OWNER_EMAIL = $email.Trim()
  $env:CODEMARKET_NEW_OWNER_PASSWORD = $password
  Push-Location (Join-Path $PSScriptRoot '..')
  $locationPushed = $true
  npm.cmd run owner:rotate-password
  if ($LASTEXITCODE -ne 0) {
    throw 'Owner password rotation failed. See the non-secret error above.'
  }
} finally {
  Remove-Item Env:CODEMARKET_OWNER_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:CODEMARKET_NEW_OWNER_PASSWORD -ErrorAction SilentlyContinue
  $password = $null
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  $securePassword.Dispose()
  if ($locationPushed) {
    Pop-Location
  }
}
