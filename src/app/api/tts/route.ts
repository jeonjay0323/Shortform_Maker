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

// 말 빠르기 조절. 게이트웨이가 speed를 무시해서, 음높이는 그대로 두고 길이만 바꾸는 WSOLA로 직접 늘이고 줄인다
const FRAME = 960; // 40ms
const HOP = FRAME / 2;
const SEEK = 240;
const stretch = (pcm: ArrayBuffer, speed: number) => {
  const x = new Int16Array(pcm, 0, pcm.byteLength >> 1);
  if (speed === 1 || x.length < FRAME * 4) return pcm;
  const win = Float32Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME));
  const outLen = Math.floor(x.length / speed);
  const out = new Float32Array(outLen + FRAME);
  const norm = new Float32Array(outLen + FRAME);
  let prev = 0; // 직전에 가져온 구간 시작점
  for (let o = 0; o + FRAME < outLen; o += HOP) {
    const target = Math.min(Math.round(o * speed), x.length - FRAME - SEEK - 1);
    let pos = target;
    if (o > 0) {
      // 직전 구간이 자연스럽게 이어졌을 소리와 가장 닮은 지점을 target 주변에서 찾는다
      const natural = prev + HOP;
      let best = -Infinity;
      for (let d = -SEEK; d <= SEEK; d += 4) {
        const c = target + d;
        if (c < 0) continue;
        let sum = 0;
        for (let i = 0; i < HOP; i += 2) sum += x[c + i] * x[natural + i];
        if (sum > best) [best, pos] = [sum, c];
      }
    }
    for (let i = 0; i < FRAME; i++) {
      out[o + i] += x[pos + i] * win[i];
      norm[o + i] += win[i];
    }
    prev = pos;
  }
  const y = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) y[i] = Math.max(-32768, Math.min(32767, Math.round(out[i] / Math.max(norm[i], 1e-3))));
  return y.buffer;
};

export async function POST(req: Request) {
  if (!isAuthed(req)) return Response.json({ error: "접속 비밀번호를 먼저 입력해 주세요." }, { status: 401 });
  if (!process.env.FACTCHAT_API_KEY) return Response.json({ error: "서버에 FACTCHAT_API_KEY가 설정되지 않았어요." }, { status: 500 });

  const { text, voice, speed } = (await req.json()) as { text?: string; voice?: string; speed?: number };
  const rate = Math.min(1.5, Math.max(0.7, Number(speed) || 1));
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
  return new Response(wav(stretch(pcm, rate)), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
}
