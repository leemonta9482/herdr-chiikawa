# Herdr Files 끌어다 놓기 설치 (치이카와 레이아웃 / 기본 모양 중 선택)
#   install.ps1                          번호로 고르기
#   install.ps1 -Style chiikawa          치이카와 밤하늘 레이아웃 + 끌어다 놓기
#   install.ps1 -Style basic             기본 Herdr 모양 + 끌어다 놓기 (main 을 main-drag 로 복제)
#   install.ps1 -Style basic -Layout 이름  내가 만든 레이아웃에 끌어다 놓기만 연결
param([ValidateSet('', 'chiikawa', 'basic')][string]$Style = '', [string]$Layout = '')
if (-not $Style) {
  Write-Host ""
  Write-Host "어떤 모양으로 설치할까요?" -ForegroundColor Cyan
  Write-Host "  1) 치이카와 밤하늘 레이아웃 (배경, 투명도, Files/Changes/GitHub 패널 + 끌어다 놓기)"
  Write-Host "  2) 기본 Herdr 모양 그대로 (끌어다 놓기만 추가)"
  $c = Read-Host "번호를 입력하세요 (그냥 Enter = 1)"
  $Style = if ($c.Trim() -eq '2') { 'basic' } else { 'chiikawa' }
}
if ($Style -eq 'chiikawa') { & (Join-Path $PSScriptRoot 'chiikawa\install.ps1') }
else { & (Join-Path $PSScriptRoot 'basic\install.ps1') -Layout $Layout }
