param(
  [string]$SourceUrl = "https://prosettings.net/lists/valorant/",
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\data")
)

$ErrorActionPreference = "Stop"
$invariant = [Globalization.CultureInfo]::InvariantCulture
$utf8 = [System.Text.UTF8Encoding]::new($false)

function ConvertFrom-HtmlFragment {
  param([string]$Fragment)

  $withoutTags = [regex]::Replace($Fragment, "<[^>]+>", " ")
  $decoded = [System.Net.WebUtility]::HtmlDecode($withoutTags)
  return ([regex]::Replace($decoded, "\s+", " ")).Trim()
}

$response = Invoke-WebRequest -UseBasicParsing $SourceUrl -TimeoutSec 45
if ($response.StatusCode -ne 200) {
  throw "ProSettings returned HTTP $($response.StatusCode)."
}

$players = [System.Collections.Generic.List[object]]::new()
$rows = [regex]::Matches($response.Content, "<tr[^>]*>([\s\S]*?)</tr>", "IgnoreCase")

foreach ($row in $rows) {
  $cells = [regex]::Matches($row.Groups[1].Value, "<td[^>]*>([\s\S]*?)</td>", "IgnoreCase")
  if ($cells.Count -lt 9) {
    continue
  }

  $values = @($cells | ForEach-Object { ConvertFrom-HtmlFragment $_.Groups[1].Value })
  $hz = 0
  $dpi = 0
  $sens = 0.0
  $edpi = 0.0
  $scopedSens = 0.0

  $valid = [int]::TryParse($values[4], [ref]$hz) -and
    [int]::TryParse($values[5], [ref]$dpi) -and
    [double]::TryParse($values[6], [Globalization.NumberStyles]::Float, $invariant, [ref]$sens) -and
    [double]::TryParse($values[7], [Globalization.NumberStyles]::Float, $invariant, [ref]$edpi)

  if (-not $valid -or -not $values[2]) {
    continue
  }

  $hasScoped = [double]::TryParse(
    $values[8],
    [Globalization.NumberStyles]::Float,
    $invariant,
    [ref]$scopedSens
  )

  $players.Add([ordered]@{
    team = $values[1]
    player = $values[2]
    mouse = $values[3]
    hz = $hz
    dpi = $dpi
    sensitivity = $sens
    edpi = $edpi
    scopedSensitivity = if ($hasScoped) { $scopedSens } else { $null }
  })
}

if ($players.Count -lt 100) {
  throw "Only $($players.Count) valid player rows were found; refusing to overwrite the snapshot."
}

$snapshot = [ordered]@{
  source = $SourceUrl
  retrievedAt = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
  playerCount = $players.Count
  players = $players
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$json = $snapshot | ConvertTo-Json -Depth 5 -Compress
$jsonPath = Join-Path $OutputDirectory "valorant-pros.json"
$jsPath = Join-Path $OutputDirectory "valorant-pros.js"

[IO.File]::WriteAllText($jsonPath, $json, $utf8)
[IO.File]::WriteAllText(
  $jsPath,
  "window.VALORANT_PRO_SNAPSHOT = Object.freeze($json);`n",
  $utf8
)

Write-Output "Saved $($players.Count) VALORANT player rows."
Write-Output $jsonPath
Write-Output $jsPath
