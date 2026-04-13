# WARD PROTOCOL: Relic Containment

균열 유물을 실시간으로 판독·봉인·추방해 금서고 코어를 지키는 싱글 플레이 격리 액션입니다.

## 실행 방법

1. 저장소 루트에서 정적 서버 실행
   ```bash
   python3 -m http.server 8000
   ```
2. 브라우저에서 `http://localhost:8000/games/wardprotocol/index.html` 접속

## 조작 방법

- `A / S / D`: 레인 선택
- `J / K / L / ;`: 봉인 각인 입력
- `Space`: 균열 유물 추방
- `Shift(홀드)`: 집중 모드(시간 흐름 감속, 포커스 소모)
- `Esc`: 일시정지

## 진행 구조

- **Chapter I — Dust Intake**: 기본 형상-봉인 매핑 학습
- **Chapter II — Corruption Ledger**: EMBER 오라 반전 규칙 추가
- **Chapter III — Fracture Court**: 균열 유물(봉인 후 추방)으로 압박 증가
- **Chapter IV — Abyss Audit**: 반전 각인 파동이 주기적으로 발동되는 클라이맥스

## 시스템

- 타이틀 / 옵션 / 크레딧 / 일시정지 / 결과 화면
- 승리/패배 판정 및 즉시 재도전
- 난이도(Story/Standard/Hard)
- 접근성 옵션(큰 글씨, 플래시/흔들림 토글)
- Web Audio API 기반 SFX + 음소거/볼륨 조절
- 로컬 저장: 최고 점수 + 옵션
