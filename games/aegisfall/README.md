# AEGISFALL: Eclipse Run

11분 생존 + 코어 방어 + 빌드 선택이 결합된 싱글 플레이 전술 아레나 액션 게임입니다.

## 실행 방법

1. 저장소 루트에서 `index.html`을 열고 **AEGISFALL: Eclipse Run** 카드를 선택합니다.
2. 또는 `games/aegisfall/index.html` 파일을 브라우저에서 직접 열어 실행합니다.
3. 로컬 서버 실행 예시:

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000/games/aegisfall/index.html` 접속.

## 조작

- 이동: `W`, `A`, `S`, `D`
- 조준/사격: 마우스 이동 + 좌클릭
- 대시: `Shift` (에너지 소모)
- 펄스: `Space` (적 밀치기/적탄 제거)
- 일시정지: `P` 또는 `Esc`
- 업그레이드 선택: `1`, `2`, `3` 또는 마우스 클릭

## 주요 시스템

- 타이틀 / 옵션 / 크레딧 / 일시정지 / 결과 화면
- 4단계 진행 구조 (Approach → Breach → Onslaught → Final)
- 60초마다 3지선다 업그레이드로 빌드 변화
- 승리/패배 조건, 재시작 루프, 최고 점수/최장 생존 시간 저장
- Web Audio API 기반 효과음 + 볼륨/난이도/보조 옵션 제공

## 승리 조건

- 11분 타이머를 버티고 최종 보스를 처치하면 클리어.

## 패배 조건

- 플레이어 HP 또는 코어 HP가 0이 되면 게임 오버.
