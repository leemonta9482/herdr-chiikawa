Herdr Files 끌어다 놓기 (+ 치이카와 밤하늘 레이아웃)
====================================================

Files 패널에서 파일/폴더를 누른 채 패널 밖으로 끌면 이름표가 커서를 따라오고,
터미널 위에서 놓으면 그 절대경로가 입력돼요 (Enter 는 안 누름). 패널 위로 돌아와 놓으면 취소.

설치
  Herdr 를 켠 상태에서 install.cmd 를 더블클릭하고 모양을 고르세요.
    1) 치이카와 밤하늘 레이아웃  배경·투명도·GitHub 패널까지 바뀌어요
    2) 기본 Herdr 모양 그대로    지금 모양은 그대로 두고 끌어다 놓기만 더해요
                                (기본 main 레이아웃을 main-drag 로 복제해서 연결)
  어느 쪽이든 상단 Files / Changes 버튼을 켜고 Files 패널을 열어 둬요.
  다른 쪽으로 바꾸고 싶으면 install.cmd 를 다시 실행하거나 Ctrl+Shift+L 로 레이아웃을 고르세요.

  PowerShell 에서 직접:
    .\install.ps1 -Style chiikawa
    .\install.ps1 -Style basic
    .\install.ps1 -Style basic -Layout <내 레이아웃이름>   (그 레이아웃의 "mod": "files" 를 바꾸고 .bak 백업)

Files 패널이 안 보이면
  상단 오른쪽 Files 버튼을 누르세요. 버튼도 없으면 Ctrl+Shift+P > Welcome 에서 Files 를 켜세요.

알아둘 점
  - Windows 전용이에요 (클립보드에 경로를 넣고 붙여넣음). 그래서 클립보드 내용이 그 경로로 바뀌어요.
  - 경로는 놓은 곳이 아니라 "마지막으로 선택한 터미널"에 들어가요. 화면을 나눴다면 넣을 터미널을 먼저 한 번 클릭하세요.
  - 공백 등이 있는 경로는 "따옴표", $ 나 ` 가 있는 경로는 '작은따옴표'로 감싸고 끝에 공백을 하나 붙여요.
  - 다른 컴퓨터(ssh 로 연결한 Linux/Windows) 공간에서도 그 컴퓨터의 파일 목록과 경로가 나와요.

치이카와 레이아웃에만 있는 것
  - Files 패널에서 파일을 바로 고치고 Ctrl+S 로 저장, .. 로 상위 폴더, .md 미리보기, 디스크 변경 자동 반영
  - GitHub 이슈·PR 패널: GitHub CLI(gh)가 설치되고 로그인돼 있어야 해요 (gh auth login)
  - 권장: Claude Code 에서 /theme -> dark-ansi 로 바꾸면 밤하늘 색과 어울려요

들어있는 것
  install.cmd / install.ps1   설치 (모양 선택)
  chiikawa\                   치이카와 레이아웃, 배경 그림, 모드(chiikawa-files, -files-drag, -tabs, -changes, -github)
  basic\                      기본 모양용 모드(files-drag-path, files-drag-path-layer)
  (chiikawa-github 는 ssenu/Herdr-UI 기반, Apache-2.0: chiikawa\mods\chiikawa-github\LICENSE)
  배경 그림 출처: https://chiikawawallpaper.com/

지우기 (~\.config\herdr-app 안에서)
  먼저 Ctrl+Shift+L 로 다른 레이아웃을 고른 뒤
  치이카와: layouts\chiikawa.*, backgrounds\chiikawa-starry-br.jpg, mods\chiikawa-* 삭제
  기본 모양: layouts\main-drag.json, mods\files-drag-path, mods\files-drag-path-layer 삭제
