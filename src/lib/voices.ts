// Gemini TTS 목소리. 이름은 API 값, label은 화면에 보이는 설명
export const VOICES = [
  { id: "Kore", label: "여성 · 차분" },
  { id: "Aoede", label: "여성 · 밝음" },
  { id: "Leda", label: "여성 · 상냥" },
  { id: "Puck", label: "남성 · 경쾌" },
  { id: "Charon", label: "남성 · 신뢰" },
  { id: "Fenrir", label: "남성 · 활기" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];
