import { isAuthed } from "@/lib/auth";
import { VOICES } from "@/lib/voices";

// 챗쿠(경희대) 게이트웨이의 Gemini TTS. 응답은 헤더 없는 PCM(24kHz·16bit·mono)이라 WAV 헤더를 붙여 돌려준다
const GATEWAY = "https://factchat-cloud.mindlogic.ai/v1/gateway/audio/speech";
const MODEL = "gemini-3.8-flash-tts";
const SAMPLE_RATE = 24000;
const MAX_CHARS = 300;

const wav = (pcm: ArrayBuffer) => {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.byteLength, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm], { type: "audio/wav" });
};

export async function POST(req: Request) {
  if (!isAuthed(req)) return Response.json({ error: "접속 비밀번호를 먼저 입력해 주세요." }, { status: 401 });
  if (!process.env.FACTCHAT_API_KEY) return Response.json({ error: "서버에 FACTCHAT_API_KEY가 설정되지 않았어요." }, { status: 500 });

  const { text, voice } = (await req.json()) as { text?: string; voice?: string };
  const input = text?.trim().slice(0, MAX_CHARS);
  if (!input) return Response.json({ error: "읽을 문장이 없어요." }, { status: 400 });
  const chosen = VOICES.find((v) => v.id === voice)?.id ?? VOICES[0].id;

  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.FACTCHAT_API_KEY}` },
    body: JSON.stringify({ model: MODEL, input, voice: chosen }),
  });
  if (!r.ok) {
    console.error("tts gateway", r.status, (await r.text()).slice(0, 300));
    return Response.json({ error: `음성을 만들지 못했어요 (${r.status})` }, { status: 502 });
  }
  const pcm = await r.arrayBuffer();
  return new Response(wav(pcm), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
}
