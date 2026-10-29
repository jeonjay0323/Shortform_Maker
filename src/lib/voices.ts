const ANCHOR = "뉴스 아나운서처럼 읽어 주세요. 또박또박한 발음, 안정적이고 신뢰감 있는 톤, 문장 끝은 단정하게 내리고 감정은 과하지 않게.";

// Gemini TTS 목소리. voice는 API 값, label은 화면에 보이는 설명, style은 읽는 톤 지시(instructions)
export const VOICES = [
  { id: "Kore", voice: "Kore", label: "여성 · 차분" },
  { id: "Aoede", voice: "Aoede", label: "여성 · 밝음" },
  { id: "Leda", voice: "Leda", label: "여성 · 상냥" },
  { id: "Puck", voice: "Puck", label: "남성 · 경쾌" },
  { id: "Charon", voice: "Charon", label: "남성 · 신뢰" },
  { id: "Fenrir", voice: "Fenrir", label: "남성 · 활기" },
  { id: "AnchorF", voice: "Kore", label: "여성 · 뉴스 톤", name: "아나운서", style: ANCHOR },
  { id: "AnchorM", voice: "Charon", label: "남성 · 뉴스 톤", name: "아나운서", style: ANCHOR },
] as const satisfies readonly { id: string; voice: string; label: string; name?: string; style?: string }[];

export type VoiceId = (typeof VOICES)[number]["id"];
