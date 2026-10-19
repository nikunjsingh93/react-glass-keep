param([string]$Image = 'nikunjsingh/glass-keep:1.0.14')
$ErrorActionPreference = 'Stop'
$expectedAsset = [regex]::Match((Get-Content -Raw (Join-Path $PSScriptRoot '../dist/index.html')), 'assets/index-[^" ]+\.js').Value
foreach ($platform in @('linux/amd64', 'linux/arm64')) {
    $containerId = $null
    try {
        $containerId = docker run -d --platform $platform -p '127.0.0.1::8080' -e 'TRUST_PROXY=1' -e 'JWT_SECRET=dev-please-change' -e 'INITIAL_ADMIN_USERNAME=smoke-operator' -e 'INITIAL_ADMIN_PASSWORD=smoke-test-password-123' $Image
        if ($LASTEXITCODE -ne 0) { throw "Could not start $platform image" }
        $binding = docker port $containerId 8080
        $base = "http://$binding"
        $ready = $false
        for ($attempt = 0; $attempt -lt 100; $attempt++) {
            try { $health = Invoke-RestMethod "$base/api/health"; if ($health.ok) { $ready = $true; break } } catch { }
            Start-Sleep -Milliseconds 200
        }
        if (-not $ready) { docker logs $containerId; throw "$platform did not become healthy" }
        if ($health.version -ne '1.0.14') { throw 'Unexpected running release version' }
        $login = Invoke-RestMethod "$base/api/login" -Method Post -Headers @{'X-Forwarded-For'='192.0.2.10'} -ContentType 'application/json' -Body '{"email":"smoke-operator","password":"smoke-test-password-123"}'
        $containerLogs = docker logs $containerId 2>&1 | Out-String
        if ($containerLogs.Contains('ERR_ERL')) { throw 'Proxy validation failed' }
        $headers = @{ Authorization = "Bearer $($login.token)" }
        $note = Invoke-RestMethod "$base/api/notes" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"title":"Container smoke test","content":"Native SQLite works"}'
        if ($note.user_id -ne $login.user.id -or $note.revision -ne 1) { throw 'Missing ownership or revision metadata' }
        $null = Invoke-RestMethod "$base/api/notes/$($note.id)/archive" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"archived":true}'
        $backup = Invoke-RestMethod "$base/api/notes/export" -Headers $headers
        if ($backup.notes.Count -ne 1 -or -not $backup.notes[0].archived) { throw 'Archived note omitted from backup' }
        $html = (Invoke-WebRequest "$base/" -UseBasicParsing).Content
        if (-not $html.Contains($expectedAsset)) { throw 'Image does not contain the final tested frontend' }
        docker exec $containerId /usr/local/bin/llama-server --version
        if ($LASTEXITCODE -ne 0) { throw 'AI runtime could not load' }
        Write-Output "${platform}: health, login, SQLite, ownership, archived JSON export, frontend and llama.cpp executable passed"
    } finally {
        if ($containerId) { docker rm -f $containerId | Out-Null }
    }
}
