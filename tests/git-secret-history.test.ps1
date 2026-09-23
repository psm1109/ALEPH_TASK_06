$ErrorActionPreference = 'Stop'

$history = (& git log --all --format= -p | Out-String)
if ($LASTEXITCODE -ne 0) {
  throw 'Git 기록을 읽지 못했습니다.'
}

$forbiddenPatterns = @(
  'sb_secret_[A-Za-z0-9_-]{16,}',
  '-----BEGIN (?:RSA )?PRIVATE KEY-----',
  'AUTH_PRIVATE_JWK_B64\s*=\s*[A-Za-z0-9+/=]{40,}',
  'SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^\s<]+'
)

foreach ($pattern in $forbiddenPatterns) {
  if ($history -match $pattern) {
    throw 'Git 기록에서 비공개 키 형태를 찾았습니다. 값은 안전을 위해 출력하지 않습니다.'
  }
}

$jwtPattern = 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'
foreach ($match in [regex]::Matches($history, $jwtPattern)) {
  try {
    $payload = $match.Value.Split('.')[1].Replace('-', '+').Replace('_', '/')
    while ($payload.Length % 4 -ne 0) { $payload += '=' }
    $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
    if ($claims.role -eq 'service_role') {
      throw 'Git 기록에서 service-role JWT를 찾았습니다. 값은 안전을 위해 출력하지 않습니다.'
    }
  } catch {
    if ($_.Exception.Message -like 'Git 기록에서 service-role*') { throw }
  }
}

Write-Output 'git secret history checks: passed'
