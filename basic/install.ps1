# Herdr Files 끌어다 놓기 → 터미널에 절대경로 입력: 설치 스크립트
#   install.ps1                 모드 복사 + 기본 레이아웃(main)을 main-drag 로 복제해 연결하고 그 레이아웃으로 전환
#   install.ps1 -Layout 이름    내가 만든 레이아웃(layouts\이름.json)의 Files 패널을 이 버전으로 바꿈
param([string]$Layout)
$src = $PSScriptRoot
$app = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } else { Join-Path $env:USERPROFILE '.config\herdr-app' }
if (-not (Test-Path $app)) { Write-Host "Herdr 앱 폴더가 없어요: $app`nHerdr를 한 번 실행한 뒤 다시 설치하세요." -ForegroundColor Red; exit 1 }
$hasCli = [bool](Get-Command herdr-app -ErrorAction SilentlyContinue)

New-Item -ItemType Directory -Force (Join-Path $app 'mods') | Out-Null
Copy-Item (Join-Path $src 'mods\*') (Join-Path $app 'mods') -Recurse -Force
Write-Host "모드 복사 완료: files-drag-path, files-drag-path-layer" -ForegroundColor Green

# 레이아웃 정하기: 지정이 없으면 기본 main 을 main-drag 로 복제해서 쓴다
if (-not $Layout) {
  $Layout = 'main-drag'
  if (-not (Test-Path (Join-Path $app "layouts\$Layout.json"))) {
    if (-not $hasCli) {
      Write-Host "herdr-app 명령을 못 찾았어요. Herdr를 켠 상태에서 다시 실행하거나 README.txt 의 수동 방법을 보세요." -ForegroundColor Yellow; exit 1
    }
    $r = herdr-app do layout.clone --name main --as $Layout 2>&1 | Out-String
    if ($r -notmatch '"ok"') { Write-Host "main 레이아웃을 복제하지 못했어요 (Herdr 창이 켜져 있어야 해요):`n$r" -ForegroundColor Red; exit 1 }
    for ($i = 0; $i -lt 20 -and -not (Test-Path (Join-Path $app "layouts\$Layout.json")); $i++) { Start-Sleep -Milliseconds 250 }
    Write-Host "기본 레이아웃을 '$Layout' 로 복제했어요" -ForegroundColor Green
  }
}
if ($Layout -in 'main','terminals','win98') {
  Write-Host "'$Layout' 은 Herdr 기본 레이아웃이라 직접 고칠 수 없어요. -Layout 없이 실행하면 알아서 복제해요." -ForegroundColor Yellow; exit 1
}
$file = Join-Path $app "layouts\$Layout.json"
if (-not (Test-Path $file)) { Write-Host "레이아웃 파일이 없어요: $file" -ForegroundColor Red; exit 1 }
$raw = [IO.File]::ReadAllText($file)
$n = ([regex]::Matches($raw, '"mod":\s*"files"')).Count
if ($n -gt 0) {
  Copy-Item $file "$file.bak" -Force
  $raw = [regex]::Replace($raw, '"mod":\s*"files"', '"mod": "files-drag-path"')
  [IO.File]::WriteAllText($file, $raw, (New-Object Text.UTF8Encoding $false))
  Write-Host "$Layout 레이아웃의 Files 패널을 바꿨어요 (백업: $Layout.json.bak)" -ForegroundColor Green
} elseif ($raw -notmatch '"mod":\s*"files-drag-path"') {
  Write-Host "이 레이아웃에는 기본 Files 패널(""mod"": ""files"")이 없어요. README.txt 의 수동 방법을 보세요." -ForegroundColor Yellow; exit 1
}

if (-not $hasCli) { Write-Host "Herdr에서 Ctrl+Shift+L 로 $Layout 을 고르고, 상단 Files 버튼으로 패널을 여세요."; exit 0 }

# 상단 Files/Changes 버튼 켜기: 앱 안 공유 설정이라 일회용 모드로 바꾼 뒤 바로 지운다
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

$r = herdr-app do layout.switch --name $Layout 2>&1 | Out-String
if ($r -match '"ok"') {
  herdr-app do layout.show --id panel 2>&1 | Out-Null
  Write-Host "$Layout 레이아웃 적용 완료. 오른쪽 Files 패널에서 파일을 끌어 터미널에 놓아 보세요." -ForegroundColor Green
} else {
  Write-Host "Herdr 창이 안 열려 있어요. Herdr를 켜고 Ctrl+Shift+L 로 $Layout 을 고르세요."
}
