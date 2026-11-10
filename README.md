# herdr-chiikawa

[Herdr](https://herdr.dev) 앱에 쓰는 **치이카와 밤하늘 레이아웃**과 **Files 끌어다 놓기** 기능이에요.

Files 패널에서 파일이나 폴더를 터미널로 끌어다 놓으면 그 **절대경로가 바로 입력**돼요.

![치이카와 밤하늘 배경](docs/background.jpg)

<sub>배경 그림 출처: [chiikawawallpaper.com](https://chiikawawallpaper.com/)</sub>

## 기능

### Files 끌어다 놓기 (두 모양 공통)
- Files 패널에서 파일/폴더를 누른 채 패널 밖으로 끌면 이름표가 커서를 따라와요.
- 터미널 위에서 놓으면 절대경로가 입력돼요. Enter는 누르지 않아요.
- 패널 위로 돌아와서 놓으면 취소돼요.
- 경로에 공백 등이 있으면 `"따옴표"`, `$`나 `` ` ``가 있으면 `'작은따옴표'`로 감싸고, 끝에 공백을 하나 붙여요.
- ssh로 연결한 다른 컴퓨터(Linux/Windows) 공간에서는 그 컴퓨터의 파일 목록과 경로가 나와요.

### 치이카와 레이아웃에만 있는 것
- 밤하늘 배경, 반투명 터미널, 남색 유리 느낌 색 (전용 테마라 Windows 밝은 모드에서도 같은 색)
- 상단 탭바의 **Files / Changes / GitHub / Plugin / Session** 버튼 (패널은 모두 유리 배경, 열고 닫을 때 미끄러지는 애니메이션)
- Files 패널에서 파일을 바로 고치고 `Ctrl+S`로 저장, `..`로 상위 폴더, `.md` 미리보기, 디스크 변경 자동 반영
- Files 패널의 **파일 찾기**: 목록 위 입력칸에 이름 일부를 치면 폴더 아래 모든 파일에서 퍼지 검색 (`↑`/`↓`, `Enter`, `Esc`). 검색어는 스페이스마다 따로 기억
- Files 패널의 **[바탕화면]** 칩: 바탕화면 폴더로 이동, 다시 누르거나 `Files` 제목을 누르면 원래 폴더로
- 각 행의 **`⋯`**: 기본 프로그램 / VS Code / 탐색기에서 보기 / 경로 복사
- GitHub 이슈·PR 패널 (`gh` CLI 필요). 상세 화면에서 **이슈 닫기**, **PR 머지**(Merge / Squash / Rebase, 확인 후 실행)
- **Plugin** 패널: Claude Code·Codex가 지금 폴더에서 보는 MCP 서버와 스킬 목록 (읽기 전용, 비밀 값은 가림)
- **Session** 패널: 지금 저장소의 Claude Code 세션 목록, 누르면 새 탭에서 `claude -r`로 이어서 열기. 이미 열려 있는 세션은 **초록 점**
- **탭 끌어서 분할**: 탭을 작업 화면 가장자리(바깥쪽 25%)에 놓으면 그쪽으로 나뉘어요. 터미널은 실행 중인 그대로 옮겨 와요. 옮긴 칸은 탭 바에 칩으로 남고, 칩 버튼으로 다시 탭으로 빼거나 닫아요
- **하단 바**: 이 PC의 CPU·RAM·GPU(5초마다), Claude Code 사용량 `Today $… · 5h $… · …left`(ccusage, 5분마다). 마우스를 올리면 작은 대시보드
- 원격 Windows PC(ssh) 공간에서도 파일 찾기·Plugin·Session이 그 PC의 내용을 읽어요

## 설치

1. 이 저장소를 내려받아요. **Code → Download ZIP** 후 압축을 풀면 돼요.
2. Herdr를 켠 상태에서 `install.cmd`를 더블클릭해요.
3. 모양을 골라요.
   ```
   1) 치이카와 밤하늘 레이아웃 (배경, 투명도, Files/Changes/GitHub/Plugin/Session 패널 + 끌어다 놓기)
   2) 기본 Herdr 모양 그대로 (끌어다 놓기만 추가)
   ```
   그냥 Enter를 누르면 1번이에요.

설치가 끝나면 그 레이아웃으로 바로 바뀌고, 오른쪽에 Files 패널이 열려 있어요.

PowerShell에서 직접 설치할 수도 있어요.
```powershell
.\install.ps1 -Style chiikawa
.\install.ps1 -Style basic
.\install.ps1 -Style basic -Layout <내 레이아웃이름>   # 내 레이아웃의 Files 패널에만 연결 (.bak 백업)
```

`basic`은 Herdr 기본 레이아웃(`main`)을 `main-drag`로 복제해서 연결해요. 기본 레이아웃 원본은 건드리지 않아요.

### GitHub 패널 (치이카와)
[GitHub CLI](https://cli.github.com)가 설치되고 로그인돼 있어야 해요.
```powershell
gh auth login
```

### Session 패널 · VS Code로 열기 (치이카와)
- Session 패널로 세션을 열려면 그 PC에 `claude` 명령이 있어야 해요. 이미 열려 있는 세션은 구분하지 못하니 같은 세션을 두 탭에서 열지 마세요.
- `⋯` → VS Code로 열기는 `code` 명령이 PATH에 있어야 해요 (VS Code 설치 시 기본값).

### 하단 바 사용량 (치이카와)
- [ccusage](https://github.com/ryoppippi/ccusage)를 `npx -y ccusage@latest`로 실행해요. Node.js가 있어야 하고, 실행할 때마다 최신 버전을 받아요.
- 금액은 API 가격 기준 **추정치**라 구독 요금과 달라요. 원격 스페이스에서도 이 PC 기준이에요.

## 알아둘 점

- **Windows 전용**이에요. 경로를 클립보드에 넣고 붙여넣는 방식이라, 클립보드 내용이 그 경로로 바뀌어요.
- 경로는 놓은 곳이 아니라 **마지막으로 선택한 터미널**에 들어가요. 화면을 나눴다면 넣을 터미널을 먼저 한 번 클릭하세요.
- Files 패널이 안 보이면 상단 오른쪽 **Files** 버튼을 누르세요. 버튼도 없으면 `Ctrl+Shift+P` → Welcome에서 Files를 켜세요.
- Claude Code를 쓴다면 `/theme` → `dark-ansi`로 바꾸면 밤하늘 색과 잘 어울려요.

## 되돌리기 / 지우기

`Ctrl+Shift+L`로 다른 레이아웃을 고르면 원래대로 돌아가요.

완전히 지우려면 `%USERPROFILE%\.config\herdr-app` 안에서 아래를 지우세요.

| 모양 | 지울 것 |
|---|---|
| 치이카와 | `layouts\chiikawa.*`, `backgrounds\chiikawa-starry-br.jpg`, `mods\chiikawa-*` |
| 기본 모양 | `layouts\main-drag.json`, `mods\files-drag-path`, `mods\files-drag-path-layer` |

## 구성

```
install.cmd / install.ps1   설치 (모양 선택)
chiikawa/                   치이카와 레이아웃, 배경, 모드 12개
  layouts/  backgrounds/  themes/
  mods/chiikawa-files         Files 패널 (끌어다 놓기, 편집·저장, 파일 찾기, 바탕화면 칩)
  mods/chiikawa-files-drag    끌기 중 이름표, 놓으면 경로 입력
  mods/chiikawa-files-open    행의 ⋯ 메뉴 (기본 프로그램 / VS Code / 탐색기 / 경로 복사)
  mods/chiikawa-tabs          탭바 (Files / Changes / GitHub / Plugin / Session 버튼, 분할 칩)
  mods/chiikawa-tab-drag      탭을 끌어 가장자리에 놓으면 분할
  mods/chiikawa-status        하단 바 (CPU·RAM·GPU, 사용량)
  mods/chiikawa-status-dash   하단 바 시스템 그래프
  mods/chiikawa-usage-dash    하단 바 사용량 대시보드
  mods/chiikawa-changes       Changes 패널
  mods/chiikawa-github        GitHub 이슈·PR 패널
  mods/chiikawa-plugins       MCP 서버·스킬 목록 패널
  mods/chiikawa-sessions      Claude Code 세션 목록 패널
basic/                      기본 모양용 모드 2개
  mods/files-drag-path        Files 패널 (기본 files + 끌어다 놓기)
  mods/files-drag-path-layer  끌기 중 이름표, 놓으면 경로 입력
```

## 크레딧

- 배경 그림(`chiikawa/backgrounds/chiikawa-starry-br.jpg`) 출처: [chiikawawallpaper.com](https://chiikawawallpaper.com/)
- 레이아웃, 패널(Herdr 기본 Files·Changes를 바탕으로 고친 것), 끌어다 놓기(클립보드 붙여넣기)는 직접 만들었어요.
- 아래는 [ssenu/Herdr-UI](https://github.com/ssenu/Herdr-UI)의 작업을 가져와 이 레이아웃에 맞게(유리 배경, 열고 닫기 애니메이션, 원격 Windows 지원) 고쳤어요 (Apache-2.0, 각 폴더의 `LICENSE`).
  - GitHub 연동(`chiikawa-github`), Plugin 패널(`chiikawa-plugins`), Session 패널(`chiikawa-sessions`)
  - Files의 파일 찾기(`chiikawa-files/search.js`)와 바탕화면 칩, `⋯` 메뉴(`chiikawa-files-open`)
  - 탭 끌어서 분할(`chiikawa-tab-drag`, `chiikawa-tabs`의 칩), 하단 바 시스템·사용량(`chiikawa-status`, `-status-dash`, `-usage-dash`)
- 치이카와(ちいかわ) 캐릭터의 권리는 원작자 나가노(ナガノ)에게 있어요. 이 저장소는 비공식 팬 제작물이에요.
