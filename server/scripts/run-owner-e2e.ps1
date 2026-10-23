$ErrorActionPreference = 'Stop'
$email = Read-Host 'Owner email'
$securePassword = Read-Host 'Owner password' -AsSecureString
$passwordPointer = [IntPtr]::Zero
$password = $null
$locationPushed = $false

try {
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $env:CODEMARKET_OWNER_EMAIL = $email.Trim()
  $env:CODEMARKET_OWNER_PASSWORD = $password
  Push-Location (Join-Path $PSScriptRoot '..')
  $locationPushed = $true
  npm.cmd run test:local-e2e
  if ($LASTEXITCODE -ne 0) {
    throw 'Owner-authenticated integration test failed. See the test output above.'
  }
} finally {
  Remove-Item Env:CODEMARKET_OWNER_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:CODEMARKET_OWNER_PASSWORD -ErrorAction SilentlyContinue
  $password = $null
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  $securePassword.Dispose()
  if ($locationPushed) {
    Pop-Location
  }
}
