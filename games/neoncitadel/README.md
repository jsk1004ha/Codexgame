# NEON CITADEL: Last Signal

파형 복구 액션 로그라이트 아레나 슈터. 12개 웨이브를 돌파해 코어 보스를 처치하면 승리합니다.

## 실행 방법

1. 저장소 루트에서 정적 서버 실행
   ```bash
   python3 -m http.server 8000
   ```
2. 브라우저에서 아래 주소 접속
   - 허브: `http://localhost:8000/`
   - 게임 직접 실행: `http://localhost:8000/games/neoncitadel/index.html`

## 조작

- 이동: `WASD` 또는 방향키
- 조준: 마우스 이동
- 사격: 마우스 좌클릭(누르고 있으면 자동 연사)
- 대시: `Space`
- 일시정지/재개: `Esc`
- 메뉴 조작: 마우스 또는 키보드(Tab/Enter/Space)

## 시스템 요약

- **3+ 단계 진행 변화**
  - Sector 1~4로 갈수록 적 조합과 위협 패턴이 변화
  - 중반(웨이브 4 이후)부터 Warden, 고밀도 탄막 등장
  - 최종 웨이브에서 보스 패턴 탄막 전투 진행
- **성장 루프**
  - 웨이브 사이 업그레이드 선택
  - 피해, 연사, 대시, 회복, 파편 수집, 처치 충격파 빌드 분화
- **승패 조건**
  - 승리: 12웨이브 클리어
  - 패배: HP 0
- **메타/옵션**
  - 최고 점수 저장(localStorage)
  - 진행 중 세이브 후 Continue
  - 난이도(Story/Normal/Hard), 음소거/볼륨, 화면 흔들림 옵션
- **오디오**
  - Web Audio API 기반 실시간 SFX

## 파일 구성

- `index.html` : UI, HUD, 메뉴, 캔버스 구성
- `style.css` : 게임 전용 UI 스타일
- `game.js` : 게임 상태/로직/렌더링/오디오/저장 처리
