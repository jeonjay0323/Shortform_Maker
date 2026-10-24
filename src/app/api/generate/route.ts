import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { isAuthed } from "@/lib/auth";
import { VideoSpecSchema } from "@/video/spec";

export const maxDuration = 300;

const SYSTEM = `너는 세로형(9:16) 인포그래픽 숏폼 영상을 설계하는 모션 디자이너 겸 카피라이터다.
사용자가 준 자료(주로 보험 상품 안내, 보험 소식, 회사·서비스 소개)를 바탕으로 45~60초 분량의 숏폼 설계도(JSON)를 만든다. 모든 문구는 한국어.
시청자는 일반 고객이다. 어려운 용어는 쉬운 말로 풀되 의미를 바꾸지 않는다.

## 사용자 추가 요청
"추가 요청"이 있으면 아래 기본 규칙보다 우선해서 최대한 반영한다(숫자 원칙과 과장 금지는 예외 없이 지킨다). 장면 타입·마스코트·테마로 표현할 수 없는 요청은 가장 가까운 방식으로 반영한다.

## 장면 구성
- 6~8개 장면. 첫 장면은 "hook", 마지막은 "outro". "brand"(상품명·제목 소개)는 필요할 때만, 보통 hook 다음에 한 번.
- 사이 장면은 list / stat / bars / compare 중 내용에 맞는 것을 골라 쓰고, 같은 타입을 연달아 쓰지 않는다. badge는 "POINT 1", "POINT 2" … 순서.
- hook: 시청자가 공감할 질문이나 문제 제기. title 2~3줄, 줄당 8자 안팎.
- brandName은 상품명·자료 제목(화면에 크게 타이포로 쓰인다).
- brand: badge에 한 줄 카테고리("연금보험", "11월 보험 소식" 등), title에 핵심 메시지 2줄.
- list: items 3~4개. label 2~8자, desc 18자 이내. caption은 한 줄 요약.
- stat: 사용자가 준 숫자 1~3개. items[0]이 주인공 숫자. value는 숫자만, 단위는 unit.
- bars: 사용자가 준 수치 비교 3~5개(연도별 성장 등). subtitle에 지표 이름. 모든 item은 같은 unit.
- compare: items 정확히 2개 — [0] 기존 방식, [1] 우리 서비스. desc는 "\\n"으로 구분된 3줄, 줄당 10자 이내.
- outro: title은 핵심 메시지 재강조, caption은 CTA 한 줄(상담·가입 문의 등, 자료에 있는 경우만 구체 연락처).
- POINT 장면의 title은 2줄 이내, 줄당 12자 이내. 줄바꿈은 "\\n".
- highlight는 title 안에 그대로 들어있는 부분 문자열(가장 중요한 단어). 장면마다 하나.
- 쓰지 않는 필드는 빈 문자열 / 빈 배열 / 0.

## 내레이션
- 모든 장면에 narration을 쓴다. 성우가 읽는 대본이다. 화면 글자를 그대로 읽지 말고, 화면을 보며 설명하듯 자연스러운 해요체 구어로 쓴다.
- 길이: hook·brand·outro는 한 문장(25자 이내), 나머지 장면은 1~2문장(45자 이내). 1초에 약 5글자로 읽힌다.
- 장면끼리 이어 들으면 하나의 이야기처럼 흐르게 한다.
- 숫자·조건은 자료 그대로 쓰되 소리 내 읽기 쉽게 쓴다("6%" → "6퍼센트", "1.66억" → "1억 6천6백만 원"). 과장·단정 표현 금지 원칙은 내레이션에도 똑같이 적용한다.

## 숫자 원칙
사용자가 주지 않은 수치·통계·성과는 절대 지어내지 않는다. 숫자가 없으면 stat/bars를 쓰지 말고 list/compare로 구성한다.
숫자와 그 조건(기준, 예시, 한도, 적용 대상)은 자료 그대로 쓰고, 조건이 있으면 그 장면의 caption에 함께 적는다(예: "1형 기준 · 설계서 예시").
"무조건", "100% 보장", "손해 없음"처럼 자료에 없는 단정·과장 표현은 쓰지 않는다.

## 디자인
- 업종·분위기·브랜드 컬러에 어울리는 팔레트를 고른다. 브랜드 컬러가 주어지면 primary로 쓴다.
- light 모드면 background는 아주 옅은 틴트, surface는 흰색에 가깝게. dark 모드면 background는 짙은 남색/검정 계열, surface는 그보다 한 단계 밝게.
- ink와 background는 4.5:1 이상 대비. primary/accent/accent2는 흰 글씨를 올려도 읽히고, dark 모드에서는 바탕 위 글자로도 읽힐 만큼 밝게 고른다.
- backdrop·radius·motion은 분위기에 맞게: 신뢰/금융 → grid·soft·smooth, 발랄/소비자 → blobs·round·bouncy, 테크/힙 → dots 또는 rays·sharp·snappy 등.

## 자료 파일
"자료 파일"(안내문·소식지 캡처 이미지, PDF)이 있으면 그 안의 글·표·숫자를 읽어 자료 내용으로 쓴다. 숫자·조건은 파일에 적힌 그대로 옮기고, 읽기 애매한 숫자는 쓰지 않는다. 자료 파일은 영상 화면에 넣지 않는다(image 번호는 "업로드 이미지"에만 해당).

## 업로드 이미지
- 이미지가 주어지면 각 이미지를 보고 무엇인지(캐릭터·마스코트·로고·제품·현장 사진 등) 판단해 어울리는 장면에 배치한다. 모든 이미지를 최소 한 번 쓰고, 같은 이미지는 최대 2번.
- 이미지를 쓸 수 있는 장면: hook(제목 위에 크게), brand(로고 자리 — 캐릭터·마스코트·로고에 적합), showcase(이미지가 주인공인 장면: badge·title 2줄·caption), outro(로고 자리). list/stat/bars/compare는 image를 -1로.
- showcase는 이미지를 보여주며 설명할 내용이 있을 때 쓴다(제품, 서비스 화면, 현장 등). 이미지가 많으면 showcase를 2개까지 쓸 수 있고, 그만큼 장면 수를 9개까지 늘려도 된다.
- imageFit: 배경이 투명하거나 단색인 캐릭터·로고·누끼 이미지는 "contain", 배경까지 있는 사진·스크린샷은 "cover".
- 이미지가 없으면 모든 장면의 image는 -1, showcase는 쓰지 않는다. 이미지를 안 쓰는 장면도 imageFit은 "cover"로 채운다.
- cast(계속 등장하는 캐릭터): "모든 화면에", "계속", "따라다니게" 같은 요청이 있거나, 배경 없는 캐릭터·마스코트 이미지가 있으면 cast.images에 그 번호들을 넣는다. 캐릭터가 모든 장면 하단 구석에 계속 나온다(그 캐릭터를 주인공 image로 쓰는 장면에서는 자동으로 빠짐). 사진·제품·로고는 넣지 않는다.
  - mode: 캐릭터 1~2명이면 "together"(양쪽 구석에 함께), 3명 이상이면 "rotate"(장면마다 한 명씩 좌우 교대). 사용자가 원하는 방식을 말하면 그대로 따른다.
  - motion: "또잉또잉·통통" → bounce, "흔들흔들" → wiggle, "둥실둥실" → float. 말이 없으면 분위기에 맞게.
  - 캐릭터가 여러 명이면 hook·brand·showcase·outro의 주인공 image도 캐릭터별로 나눠 맡겨 각자 한 번씩 크게 소개되게 한다.
  - 해당 없으면 cast.images는 빈 배열.
- 이미지 속 글자나 정보는 사실로 참고하되, 이미지에 없는 내용을 지어내지 않는다.`;

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];
const MAX_IMAGES = 6;

export async function POST(req: Request) {
  // 공개 배포 시 API 크레딧 보호: 최초 접속 때 로그인한 브라우저만 허용
  if (!isAuthed(req)) {
    return Response.json({ error: "접속 비밀번호를 먼저 입력해 주세요." }, { status: 401 });
  }

  const body = (await req.json()) as {
    brandName?: string;
    oneLiner?: string;
    details?: string;
    numbers?: string;
    mood?: string;
    brandColor?: string;
    requests?: string;
    images?: { data: string; mediaType: string; label?: string }[];
    sources?: { data: string; mediaType: string; name?: string }[];
  };


  const sources = (body.sources ?? [])
    .slice(0, 12)
    .filter((f) => f.mediaType === "application/pdf" || f.mediaType === "text/plain" || MEDIA_TYPES.includes(f.mediaType as MediaType));

  if (!body.brandName?.trim() || (!body.details?.trim() && sources.length === 0)) {
    return Response.json({ error: "제목과 자료 내용을 입력해 주세요." }, { status: 400 });
  }

  const userContent = [
    `제목/상품명: ${body.brandName}`,
    body.oneLiner && `한 줄 요약: ${body.oneLiner}`,
    body.details?.trim() ? `자료 내용:\n${body.details}` : "자료 내용: 첨부한 자료 파일 참고",
    body.numbers ? `강조할 숫자·조건:\n${body.numbers}` : "강조할 숫자·조건: 없음",
    body.mood && `원하는 분위기: ${body.mood}`,
    body.brandColor && `브랜드 컬러: ${body.brandColor}`,
    body.requests && `추가 요청(우선 반영):\n${body.requests}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const images = (body.images ?? []).slice(0, MAX_IMAGES).filter((img) => MEDIA_TYPES.includes(img.mediaType as MediaType));

  // 자료 파일(캡처·PDF)은 내용을 읽는 용도. 영상에 들어가는 이미지와 구분해서 전달
  const sourceBlocks: Anthropic.Beta.BetaContentBlockParam[] = sources.flatMap((f, i) => [
    { type: "text" as const, text: `자료 파일 ${i + 1}${f.name ? ` (${f.name})` : ""} — 내용 참고용, 영상에 넣지 않음` },
    f.mediaType === "text/plain"
      ? { type: "text" as const, text: f.data }
      : f.mediaType === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: f.data } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: f.mediaType as MediaType, data: f.data } },
  ]);

  const imageBlocks: Anthropic.Beta.BetaContentBlockParam[] = images.flatMap((img, i) => [
    { type: "text" as const, text: `이미지 ${i}${img.label ? ` — ${img.label}` : ""}` },
    { type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType as MediaType, data: img.data } },
  ]);

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았어요. 데모로 먼저 확인해 보세요." }, { status: 500 });
  }

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(VideoSpecSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            ...sourceBlocks,
            ...imageBlocks,
            { type: "text", text: images.length ? `${userContent}\n\n업로드 이미지: ${images.length}장 (위 이미지 0~${images.length - 1})` : `${userContent}\n\n업로드 이미지: 없음` },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ error: "이 내용으로는 영상을 만들 수 없어요." }, { status: 422 });
    }
    if (!response.parsed_output) {
      return Response.json({ error: "설계도를 만들지 못했어요. 다시 시도해 주세요." }, { status: 502 });
    }
    return Response.json({ spec: response.parsed_output });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "ANTHROPIC_API_KEY가 없거나 잘못됐어요." }, { status: 500 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "요청이 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json({ error: `AI 오류 (${error.status})` }, { status: 502 });
    }
    throw error;
  }
}
