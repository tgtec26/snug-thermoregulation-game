# 체온 조절 원정대 (Thermoregulation Quest)

중학교 3학년 과학 「체온 조절(항상성)」 단원의 **정리·심화 활동용** 2D 도트 RPG + 퀴즈 + 미니게임.

학생이 추운 나라(예: 핀란드)와 더운 나라(예: 두바이)를 여행하면서, 외부 환경 변화와 패러독스 실내 환경(추운 나라의 사우나, 더운 나라의 실내 스키장)에서 일어나는 체온 조절 기전을 체험·학습한다.

## 📍 현재 상태: 브레인스토밍 (Q4 답변 대기)

코드는 아직 한 줄도 작성되지 않았습니다. 디자인 스펙이 확정되기 전까지는 어떤 구현도 시작하지 않습니다.

**다음 작업을 이어가려면**: [docs/brainstorm-progress.md](docs/brainstorm-progress.md) 를 먼저 읽으세요. 어디까지 결정됐고, 다음 질문이 무엇인지가 정리되어 있습니다.

## 📚 자료

- [docs/brainstorm-progress.md](docs/brainstorm-progress.md) — 브레인스토밍 진행 기록 (메인 핸드오프 문서)
- [docs/textbook-summary.md](docs/textbook-summary.md) — 4종 교과서(비상·천재·동아·미래엔)의 체온 조절 단원 핵심 비교
- [docs/brainstorm-mockups/](docs/brainstorm-mockups/) — 브레인스토밍 중 사용한 시각 컴패니언 mockup 보관소

## 🔗 참고 프로젝트

| 프로젝트 | 역할 |
|---|---|
| `snug-hormone-game` | 인프라·패턴 재활용 베이스 (Next.js + Phaser + Zustand + admin 시각 편집기) |
| `pizza-expedition` | 좌표 데이터 분리 + `?admin=1` 부트스트랩 패턴의 출처 |
| `snug-online-office` | 자매 시뮬레이터 — 혈당량 조절은 이쪽이 담당하므로 본 게임과 콘텐츠 중복 회피 |

## 🛠 예정 기술 스택 (snug-hormone-game 동일)

- Next.js 16 (App Router) · Phaser 4 · TypeScript · Tailwind CSS 4 · Zustand · Vitest · pnpm
- 배포: Vercel (GitHub 자동)

## 운영 기록
- `admin` 페이지는 로컬에서만 열리고 배포본에서는 404이다(저장 API는 403).
- 성능 예산: 저사양 크롬북 30fps, 첫 로딩·장면 전환이 수업 흐름을 끊지 않기, 초기 다운로드(음원 제외) 1.5MB 이하.
- 학습 기록: 공항 퀴즈 시도·공항 통과를 결과와 포트폴리오 전송에 포함. 개인 식별 정보 제외. 이름은 기기에만 저장한다. 저장 버전 3(기존 버전에서 자동 이전).
- 일시정지·새로 시작: 게임 화면 오른쪽 위 버튼. 일시정지는 Phaser 씬+음소거+오버레이. 힌트 단계는 퀴즈 오답 추적(quizWrongPhases)이 있어 후속 설계 시 잇는다.
