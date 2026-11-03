# 치이카와 밤하늘 Herdr 레이아웃 + Files 끌어다 놓기 설치 스크립트
$src = $PSScriptRoot
$app = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } else { Join-Path $env:USERPROFILE '.config\herdr-app' }
if (-not (Test-Path $app)) { Write-Host "Herdr 앱 폴더가 없어요: $app`nHerdr를 한 번 실행한 뒤 다시 설치하세요." -ForegroundColor Red; exit 1 }

New-Item -ItemType Directory -Force (Join-Path $app 'layouts'), (Join-Path $app 'backgrounds') | Out-Null
Copy-Item (Join-Path $src 'layouts\chiikawa.json'), (Join-Path $src 'layouts\chiikawa.png') (Join-Path $app 'layouts') -Force
Copy-Item (Join-Path $src 'backgrounds\chiikawa-starry-br.jpg') (Join-Path $app 'backgrounds') -Force
Write-Host "파일 복사 완료: $app" -ForegroundColor Green

# 편집 가능한 Files 패널 + Ctrl+S 단축키
New-Item -ItemType Directory -Force (Join-Path $app 'mods') | Out-Null
Copy-Item (Join-Path $src 'mods\*') (Join-Path $app 'mods') -Recurse -Force
$keysPath = Join-Path $app 'keys.json'
if (Test-Path $keysPath) {
  $raw = Get-Content $keysPath -Raw -Encoding UTF8
  if ($raw -notmatch '"mod:chiikawa-files"') {
    # 마지막 } 앞에 섹션 하나만 끼워 넣는다 (기존 키는 건드리지 않음)
    $i = $raw.LastIndexOf('}')
    $raw = $raw.Substring(0, $i).TrimEnd() + ",`n  `"mod:chiikawa-files`": { `"ctrl-s`": `"chiikawa-files.save`" }`n}`n"
    [IO.File]::WriteAllText($keysPath, $raw, (New-Object Text.UTF8Encoding $false))
  }
} else {
  [IO.File]::WriteAllText($keysPath, "{`n  `"mod:chiikawa-files`": { `"ctrl-s`": `"chiikawa-files.save`" }`n}`n", (New-Object Text.UTF8Encoding $false))
}

if (-not (Get-Command herdr-app -ErrorAction SilentlyContinue)) { Write-Host "herdr-app 명령을 못 찾았어요. Herdr에서 Ctrl+Shift+L 로 chiikawa 를 고르세요."; exit 0 }

# Files/Changes 버튼 켜기: 앱 안 공유 설정이라 일회용 모드로 바꾼 뒤 바로 지운다
$mod = Join-Path $app 'mods\enable-panels'
New-Item -ItemType Directory -Force $mod | Out-Null
$utf8 = New-Object Text.UTF8Encoding $false
[IO.File]::WriteAllText((Join-Path $mod 'mod.json'), '{"place":"none","overlay":{"width":1,"height":1}}', $utf8)
[IO.File]::WriteAllText((Join-Path $mod 'main.js'), @"
import { View, div } from "gpui-kit";
import { setShared, shared, props, closeOverlay } from "herdr";
export default class EnablePanels extends View {
  init() { setShared("workspace.panels", [...new Set([...(shared("workspace.panels") ?? []), "files", "changes"])]); const o = props()?.overlay; if (o) closeOverlay(o); }
  render() { return div(); }
}
"@, $utf8)
Start-Sleep 1
herdr-app do mod.open --name enable-panels 2>&1 | Out-Null
Start-Sleep 2
Remove-Item -Recurse -Force $mod

$r = herdr-app do layout.switch --name chiikawa 2>&1 | Out-String
if ($r -match '"ok"') {
  # 예전에 패널을 접어둔 적이 있어도 Files 패널이 보이게
  herdr-app do layout.show --id panel 2>&1 | Out-Null
  Write-Host "chiikawa 레이아웃 적용 완료 (오른쪽 Files 패널에서 파일을 끌어 터미널에 놓아 보세요)" -ForegroundColor Green
}
else { Write-Host "Herdr 창이 안 열려 있어요. Herdr를 켜고 Ctrl+Shift+L 로 chiikawa 를 고르세요. (Files/Changes 버튼은 Ctrl+Shift+P > Welcome 에서 켤 수 있어요)" }