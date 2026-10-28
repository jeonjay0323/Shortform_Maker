import { z } from "zod";

// AI가 채우는 영상 설계도. 구조화 출력(JSON Schema)로도 쓰이므로 단순한 형태를 유지한다.

const Hex = z.string().describe("#RRGGBB 형식 색상");

export const ThemeSchema = z.object({
  mode: z.enum(["light", "dark"]),
  background: Hex.describe("화면 바탕색"),
  surface: Hex.describe("카드 배경색"),
  ink: Hex.describe("본문 제목 글자색"),
  sub: Hex.describe("보조 글자색"),
  primary: Hex.describe("메인 강조색"),
  accent: Hex.describe("두 번째 강조색"),
  accent2: Hex.describe("세 번째 강조색"),
  backdrop: z.enum(["rays", "blobs", "grid", "dots"]).describe("배경 장식 패턴"),
  radius: z.enum(["round", "soft", "sharp"]).describe("카드 모서리"),
  motion: z.enum(["bouncy", "smooth", "snappy"]).describe("등장 모션 성격"),
});

export const ItemSchema = z.object({
  label: z.string(),
  desc: z.string(),
  value: z.number(),
});

export const SceneSchema = z.object({
  type: z.enum(["hook", "brand", "list", "stat", "bars", "compare", "showcase", "outro"]),
  badge: z.string().describe('"POINT 1" 같은 작은 배지. 없으면 빈 문자열'),
  title: z.string().describe("헤드라인. 줄바꿈은 \\n"),
  highlight: z.string().describe("title 안에서 강조색으로 칠할 부분 문자열. 없으면 빈 문자열"),
  subtitle: z.string(),
  items: z.array(ItemSchema),
  caption: z.string().describe("장면 하단 요약 박스 문구. 없으면 빈 문자열"),
  unit: z.string().describe('숫자 단위 ("%", "만 명" 등). 없으면 빈 문자열'),
  image: z.number().describe("이 장면에 쓸 업로드 이미지 번호(0부터). 안 쓰면 -1"),
  narration: z.string().describe("이 장면에서 성우가 읽을 내레이션. 구어체 1~2문장"),
  imageFit: z.enum(["cover", "contain"]).describe("사진은 cover, 배경 없는 캐릭터·로고·누끼는 contain"),
  tension: z
    .enum(["none", "impact", "riser", "tick", "heartbeat"])
    .describe("이 장면에 넣을 긴장감 효과음. impact=쿵(충격적인 숫자·반전), riser=점점 커지는 소리(이 장면 직전에 고조), tick=째깍째깍(마감·시간 압박), heartbeat=두근두근(불안·걱정), none=없음"),
});

// 모든 장면 구석에 계속 등장하는 캐릭터들
export const CastSchema = z.object({
  images: z.array(z.number()).describe("계속 등장할 캐릭터 이미지 번호들. 없으면 빈 배열"),
  mode: z.enum(["together", "rotate"]).describe("together=1~2명이 양쪽 구석에 함께, rotate=장면마다 한 명씩 번갈아 좌우 교대"),
  motion: z.enum(["bounce", "wiggle", "float"]).describe("bounce=통통 튀는 점프(또잉또잉), wiggle=좌우로 흔들흔들, float=둥실둥실"),
});

export const VideoSpecSchema = z.object({
  brandName: z.string(),
  cast: CastSchema,
  theme: ThemeSchema,
  scenes: z.array(SceneSchema),
});

export type Theme = z.infer<typeof ThemeSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type VideoSpec = z.infer<typeof VideoSpecSchema>;

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

// 장면 길이(프레임)는 내용량에 맞춰 코드가 정한다
// 장면별 내레이션 음성. 음성이 있으면 장면 길이를 음성에 맞춰 늘린다
export type Voice = { src: string; sec: number };
export const VOICE_START = 12;

export const sceneDuration = (s: Scene, voice?: Voice | null): number => {
  const base = baseDuration(s);
  return voice ? Math.max(base, VOICE_START + Math.ceil(voice.sec * FPS) + 18) : base;
};

const baseDuration = (s: Scene): number => {
  const n = s.items.length;
  switch (s.type) {
    case "hook":
      return 120;
    case "brand":
      return 150;
    case "list":
      return 100 + n * 45 + 70;
    case "stat":
      return 180 + Math.max(0, n - 1) * 30;
    case "bars":
      return 100 + n * 35 + 80;
    case "compare":
      return 240;
    case "showcase":
      return 180;
    case "outro":
      return 150;
  }
};

export const totalDuration = (spec: VideoSpec, voices: (Voice | null)[] = []) =>
  spec.scenes.reduce((sum, s, i) => sum + sceneDuration(s, voices[i]), 0);

// API 키 없이 확인용
export const DEMO_SPEC: VideoSpec = {
  brandName: "그린박스",
  cast: { images: [], mode: "together", motion: "bounce" },
  theme: {
    mode: "light",
    background: "#F2F8F4",
    surface: "#FFFFFF",
    ink: "#13261C",
    sub: "#5F7A6B",
    primary: "#17A35B",
    accent: "#FF8A3D",
    accent2: "#3B82F6",
    backdrop: "blobs",
    radius: "round",
    motion: "bouncy",
  },
  scenes: [
    { type: "hook", badge: "", title: "택배 박스,\n한 번 쓰고\n버리시나요?", highlight: "버리시나요?", subtitle: "", items: [], caption: "", unit: "", image: -1, narration: "택배 박스, 한 번 쓰고 그냥 버리시나요?", imageFit: "cover", tension: "none" },
    { type: "brand", badge: "다회용 포장 서비스", title: "박스는 돌아오고,\n쓰레기는 사라진다", highlight: "쓰레기는 사라진다", subtitle: "", items: [], caption: "", unit: "", image: -1, narration: "그래서 만들었어요. 다회용 포장 서비스, 그린박스.", imageFit: "cover", tension: "none" },
    {
      type: "list",
      badge: "POINT 1",
      title: "포장부터 회수까지\n한 번에",
      highlight: "한 번에",
      subtitle: "",
      items: [
        { label: "주문", desc: "쇼핑몰에서 그린박스 포장 선택", value: 0 },
        { label: "배송", desc: "튼튼한 다회용 박스로 도착", value: 0 },
        { label: "반납", desc: "문 앞에 접어두면 끝", value: 0 },
        { label: "세척·재사용", desc: "세척 후 다시 출발", value: 0 },
      ],
      caption: "고객은 접어두기만 하면 돼요",
      unit: "",
      image: -1,
      narration: "주문하면 튼튼한 다회용 박스로 도착하고, 다 쓰면 문 앞에 접어두기만 하면 돼요.",
      imageFit: "cover",
      tension: "none",
    },
    {
      type: "stat",
      badge: "POINT 2",
      title: "한 박스로\n최대 50번",
      highlight: "50번",
      subtitle: "",
      items: [{ label: "박스 1개 재사용 횟수", desc: "", value: 50 }],
      caption: "골판지 박스 50개를 아끼는 셈",
      unit: "회",
      image: -1,
      narration: "박스 하나로 최대 오십 번까지 다시 쓸 수 있어요.",
      imageFit: "cover",
      tension: "impact",
    },
    {
      type: "bars",
      badge: "POINT 3",
      title: "함께하는 브랜드가\n늘고 있어요",
      highlight: "늘고 있어요",
      subtitle: "제휴 브랜드 수",
      items: [
        { label: "2024", desc: "", value: 12 },
        { label: "2025", desc: "", value: 48 },
        { label: "2026", desc: "", value: 130 },
      ],
      caption: "2년 만에 10배 성장",
      unit: "곳",
      image: -1,
      narration: "함께하는 브랜드도 이 년 만에 열 배로 늘었어요.",
      imageFit: "cover",
      tension: "none",
    },
    {
      type: "compare",
      badge: "POINT 4",
      title: "포장이 바뀌면\n이렇게 달라져요",
      highlight: "달라져요",
      subtitle: "",
      items: [
        { label: "일회용 박스", desc: "뜯고 버리기\n분리수거 부담\n매번 새로 생산", value: 0 },
        { label: "그린박스", desc: "접어서 반납\n쓰레기 0\n세척 후 재사용", value: 0 },
      ],
      caption: "",
      unit: "",
      image: -1,
      narration: "뜯고 버리던 포장이, 접어서 돌려보내는 포장으로 바뀝니다.",
      imageFit: "cover",
      tension: "riser",
    },
    { type: "outro", badge: "", title: "박스는 돌아오고,\n쓰레기는 사라진다", highlight: "쓰레기는 사라진다", subtitle: "", items: [], caption: "greenbox.example", unit: "", image: -1, narration: "박스는 돌아오고, 쓰레기는 사라집니다. 그린박스였어요.", imageFit: "cover", tension: "none" },
  ],
};
