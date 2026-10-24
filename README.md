# Shortform Maker

보험 상품 안내·보험 소식 같은 자료를 입력하면, AI가 장면 구성·컬러·모션을 디자인해 1분 세로(9:16) 인포그래픽 숏폼으로 만들어 주는 웹앱.

- 입력: 제목/상품명, 한 줄 요약, 자료 내용, 강조할 숫자·조건, 이미지(캐릭터·상품·로고, 최대 6장)
- AI 설계: Claude(`claude-opus-5-5`)가 구조화 출력으로 영상 설계도(JSON)를 생성 — 숫자·조건은 원문 그대로, 과장 표현 금지
- 영상: [Remotion](https://www.remotion.dev)으로 렌더링, 미리보기는 `@remotion/player`, MP4는 브라우저에서 바로 변환(`@remotion/web-renderer`)
- 접근 제어: 최초 접속 시 비밀번호 1회 입력 → 서명 쿠키로 30일 유지

## 구조

| 경로 | 역할 |
|---|---|
| `src/video/spec.ts` | 영상 설계도 스키마(zod), 장면 길이, 데모 데이터 |
| `src/video/ShortVideo.tsx` | Remotion 컴포지션 — 장면 hook / brand / list / stat / bars / compare / showcase / outro |
| `src/app/api/generate` | Claude 호출 → 설계도 반환 |
| `src/app/api/login`, `src/app/api/session` | 접속 비밀번호 확인·세션 쿠키 |
| `src/app/page.tsx` | 입력 폼, 이미지 업로드, 미리보기, MP4 다운로드 |

## 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev
```

환경 변수

| 이름 | 설명 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API 키 |
| `ACCESS_PASSWORDS` | 접속 비밀번호, 여러 개면 콤마로 구분 (비우면 비밀번호 없이 열림) |
| `AUTH_SECRET` | 세션 쿠키 서명용 임의 문자열 |

## 배포

Vercel에 Next.js 프로젝트로 배포(`vercel.json`에 framework 고정). 위 환경 변수를 Production에 등록.

Remotion을 회사·상업 용도로 쓰려면 [Remotion 라이선스](https://www.remotion.dev/license)를 확인하세요.

## 음원 출처

배경음악 프리셋(`public/bgm`)은 모두 CC0(퍼블릭 도메인) 곡의 앞 90초를 잘라 음량을 맞춘 것입니다.

| 파일 | 곡 | 작곡 | 출처 |
|---|---|---|---|
| first-light.mp3 | First Light Particles | Yoiyami | [OpenGameArt](https://opengameart.org/node/182244) |
| deep-blue.mp3 | Yoiyami Core Theme – Deep Blue Ambient Piano | Yoiyami | [OpenGameArt](https://opengameart.org/content/yoiyami-core-theme-%E2%80%93-deep-blue-ambient-piano) |
| budding.mp3 | The Budding of Consciousness | Yoiyami | [OpenGameArt](https://opengameart.org/content/the-budding-of-consciousness-%E2%80%93-cc0-ambient-minimalist-theme-yoiyami-blue-series-%E2%80%93-no4) |
| sunset-plains.mp3 | Sunset Plains | Yoiyami | [OpenGameArt](https://opengameart.org/content/sunset-plains) |
| calm-relax.mp3 | Calm Relax 1 (Synthwave 421k) | The Cynic Project / cynicmusic.com / pixelsphere.org | [OpenGameArt](https://opengameart.org/node/97110) |

장면 전환 효과음(`public/sfx`)은 이 프로젝트에서 코드로 합성한 소리입니다.
