# Codex Game Hub

코덱스가 만든 다양한 웹 게임을 메인 페이지에서 바로 접속할 수 있도록 구성한 저장소입니다.

## 구조

- `index.html`: 모든 게임으로 이동하는 메인 허브 페이지
- `games/<game-name>/index.html`: 개별 게임 엔트리 파일
- `agent.md`: 게임 추가/연결 시 따라야 할 작업 규칙

## 메인 페이지 디자인

- 미니멀한 다크 톤 그라디언트 배경과 유리 질감 카드(`.card`)를 사용합니다.
- 카드 진입 애니메이션(`card-in`)과 배경 오브젝트 이동 애니메이션(`drift`)이 적용되어 있습니다.
- 사용자 접근성을 위해 `prefers-reduced-motion: reduce` 환경에서는 애니메이션/트랜지션을 비활성화합니다.

## 새 게임 추가 방법

1. `games/` 아래에 게임 폴더를 만듭니다.
   - 예: `games/tetris/`
2. 해당 폴더에 시작 파일을 만듭니다.
   - 예: `games/tetris/index.html`
3. 루트의 `index.html`에 게임 카드와 링크를 추가합니다.
   - 예: `<a href="./games/tetris/index.html">게임 시작 →</a>`
4. 브라우저에서 `index.html`을 열어 링크 동작을 확인합니다.

## 로컬 실행

정적 파일이라서 별도 빌드가 필요 없습니다. 루트에서 아래 명령어로 확인할 수 있습니다.

```bash
python3 -m http.server 8000
```

그 후 브라우저에서 `http://localhost:8000`에 접속하세요.
