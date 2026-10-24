"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ShortVideo, type Sfx } from "@/video/ShortVideo";
import { SOURCE_ACCEPT, readSource, removeBg, shrink, type Source, type Upload } from "@/lib/files";
import { VOICES, type VoiceId } from "@/lib/voices";
import { DEMO_SPEC, FPS, HEIGHT, WIDTH, totalDuration, type VideoSpec, type Voice } from "@/video/spec";
import { THEMES } from "@/video/themes";

const PreviewPlayer = dynamic(() => import("@/components/PreviewPlayer"), {
  ssr: false,
  loading: () => <div className="aspect-[9/16] w-full animate-pulse bg-zinc-100" />,
});

// CC0 음원(OpenGameArt), 길면 앞 90초만 잘라 음량을 맞춘 것. 출처는 README 참고
const BGM_PRESETS = [
  { id: "first-light", name: "First Light", mood: "몽환 피아노", group: "잔잔" },
  { id: "deep-blue", name: "Deep Blue", mood: "차분한 피아노", group: "잔잔" },
  { id: "budding", name: "Budding", mood: "미니멀 피아노", group: "잔잔" },
  { id: "sunset-plains", name: "Sunset Plains", mood: "어쿠스틱 기타", group: "잔잔" },
  { id: "calm-relax", name: "Calm Relax", mood: "부드러운 신스", group: "잔잔" },
  { id: "happy-clappy", name: "Happy Clappy", mood: "경쾌한 피아노", group: "발랄" },
  { id: "happy-vibes", name: "Happy Vibes", mood: "귀여운 신스", group: "발랄" },
  { id: "happy-beat", name: "Happy Beat", mood: "드럼·플루트", group: "발랄" },
  { id: "fun-beat", name: "Fun Beat", mood: "신나는 비트", group: "발랄" },
  { id: "upbeat-song", name: "Upbeat Song", mood: "통통 게임풍", group: "발랄" },
];

type Form = {
  brandName: string;
  oneLiner: string;
  details: string;
  numbers: string;
  requests: string;
};

const MAX_IMAGES = 6;
const MAX_SOURCES = 12;

const EMPTY: Form = { brandName: "", oneLiner: "", details: "", numbers: "", requests: "" };

export default function Home() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [spec, setSpec] = useState<VideoSpec>(DEMO_SPEC);
  const [isDemo, setIsDemo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [genPct, setGenPct] = useState(0);

  // AI 응답은 한 번에 오므로 진행률은 예상 시간 기준으로 95%까지 천천히 채운다
  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    const id = setInterval(() => setGenPct(0.95 * (1 - Math.exp(-(Date.now() - start) / 14000))), 200);
    return () => clearInterval(id);
  }, [loading]);
  const [error, setError] = useState("");
  const [renderPct, setRenderPct] = useState<number | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((d) => setAuthed(!!d.authed))
      .catch(() => setAuthed(false));
  }, []);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [usedImages, setUsedImages] = useState<string[]>([]);
  const [cutting, setCutting] = useState<Record<number, string>>({});

  const cutBackground = async (i: number) => {
    setCutting((c) => ({ ...c, [i]: "준비 중…" }));
    try {
      const cut = await removeBg(uploads[i], (label) => setCutting((c) => ({ ...c, [i]: label })));
      setUploads((list) => list.map((u, j) => (j === i ? { ...cut, label: u.label } : u)));
    } catch {
      setError("배경을 지우지 못했어요. 다른 이미지로 시도해 주세요.");
    } finally {
      setCutting((c) => Object.fromEntries(Object.entries(c).filter(([k]) => Number(k) !== i)));
    }
  };

  const restoreOriginal = (i: number) =>
    setUploads((list) => list.map((u, j) => (j === i && u.original ? { ...u.original, label: u.label } : u)));
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceMsg, setSourceMsg] = useState("");
  const [reading, setReading] = useState(false);

  // 파일마다 따로 읽어서 하나가 실패해도 나머지는 올라가게 하고, 실패 이유는 입력칸 바로 아래에 보여준다
  const addSources = async (files: FileList | null) => {
    if (!files?.length) return;
    setSourceMsg("");
    setReading(true);
    const results = await Promise.allSettled([...files].map(readSource));
    setReading(false);
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const errors = results.flatMap((r) => (r.status === "rejected" ? [r.reason instanceof Error ? r.reason.message : "파일을 읽지 못했어요."] : []));
    const room = MAX_SOURCES - sources.length;
    if (ok.length > room) errors.push(`자료 파일은 최대 ${MAX_SOURCES}개(쪽)까지예요. 앞쪽 ${room}개만 넣었어요.`);
    setSources((list) => [...list, ...ok.slice(0, room)]);
    setSourceMsg(errors.join("\n"));
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_IMAGES - uploads.length;
    const next = await Promise.all([...files].filter((f) => f.type.startsWith("image/")).slice(0, room).map((f) => shrink(f)));
    setUploads((u) => [...u, ...next]);
  };

  // 테마는 생성 전후 언제든 바꿀 수 있다. "ai"면 AI가 고른 테마 그대로
  const [themeId, setThemeId] = useState("ai");
  const shownSpec = useMemo<VideoSpec>(() => {
    const preset = THEMES.find((t) => t.id === themeId);
    return preset ? { ...spec, theme: preset.theme } : spec;
  }, [spec, themeId]);

  const [bgmFile, setBgmFile] = useState<{ name: string; src: string; uploaded: boolean } | null>(null);
  const [bgmVolume, setBgmVolume] = useState(0.35);
  const [sfx, setSfx] = useState<Sfx>("whoosh");
  const bgm = useMemo(() => (bgmFile ? { src: bgmFile.src, volume: bgmVolume } : null), [bgmFile, bgmVolume]);

  const previewRef = useRef<HTMLAudioElement | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 고른 소리를 잠깐 들려준다. 다른 걸 누르면 이전 미리듣기는 멈춘다
  const preview = (src: string, seconds: number) => {
    previewRef.current?.pause();
    if (previewTimer.current) clearTimeout(previewTimer.current);
    const audio = new Audio(src);
    audio.volume = 0.6;
    audio.play().catch(() => {});
    previewRef.current = audio;
    previewTimer.current = setTimeout(() => audio.pause(), seconds * 1000);
  };

  const replaceBgm = (next: typeof bgmFile) => {
    if (bgmFile?.uploaded) URL.revokeObjectURL(bgmFile.src);
    setBgmFile(next);
  };

  const pickPreset = (id: string) => {
    if (!id) {
      previewRef.current?.pause();
      return replaceBgm(null);
    }
    const preset = BGM_PRESETS.find((m) => m.id === id)!;
    const src = `/bgm/${id}.mp3`;
    replaceBgm({ name: preset.name, src, uploaded: false });
    preview(src, 6);
  };

  const pickBgm = (file: File | undefined) => {
    if (!file) return;
    replaceBgm({ name: file.name, src: URL.createObjectURL(file), uploaded: true });
  };

  // AI 내레이션: 장면마다 대본을 챗쿠 Gemini TTS로 읽혀 영상에 넣는다
  const [narrationOn, setNarrationOn] = useState(true);
  const [voiceId, setVoiceId] = useState<VoiceId>("Kore");
  const [voices, setVoices] = useState<(Voice | null)[]>([]);
  const [voicedWith, setVoicedWith] = useState<VoiceId | null>(null);
  const [voicePct, setVoicePct] = useState<number | null>(null);
  const samples = useRef<Partial<Record<VoiceId, string>>>({});

  const tts = async (text: string, voice: VoiceId) => {
    const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice }) });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "음성을 만들지 못했어요.");
    const blob = await res.blob();
    // WAV 헤더 44바이트 뒤가 24kHz·16bit·mono 데이터
    return { src: URL.createObjectURL(blob), sec: (blob.size - 44) / (24000 * 2) };
  };

  // 장면 대본을 3개씩 동시에 읽힌다. 하나가 실패해도 그 장면만 음성 없이 넘어간다
  const synthesize = async (target: VideoSpec, voice: VoiceId) => {
    const lines = target.scenes.map((s) => s.narration?.trim() ?? "");
    const out: (Voice | null)[] = lines.map(() => null);
    let done = 0;
    let failed = 0;
    setVoicePct(0);
    const queue = lines.map((_, i) => i).filter((i) => lines[i]);
    const worker = async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        try {
          out[i] = await tts(lines[i], voice);
        } catch {
          failed++;
        }
        setVoicePct(++done / Math.max(1, lines.filter(Boolean).length));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setVoicePct(null);
    voices.forEach((v) => v && URL.revokeObjectURL(v.src));
    setVoices(out);
    setVoicedWith(voice);
    if (failed) setError(`장면 ${failed}개는 음성을 만들지 못해 글자만 나와요.`);
  };

  const revoice = async () => {
    setLoading(true);
    setError("");
    try {
      await synthesize(spec, voiceId);
    } finally {
      setLoading(false);
    }
  };

  const clearVoices = () => {
    voices.forEach((v) => v && URL.revokeObjectURL(v.src));
    setVoices([]);
    setVoicedWith(null);
  };

  const playSample = async (id: VoiceId) => {
    setVoiceId(id);
    try {
      samples.current[id] ??= (await tts("안녕하세요, 이 목소리로 영상 내용을 읽어 드릴게요.", id)).src;
      preview(samples.current[id]!, 5);
    } catch {}
  };

  const duration = useMemo(() => totalDuration(spec, voices), [spec, voices]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const generate = async () => {
    setGenPct(0);
    setLoading(true);
    setError("");
    try {
      const payload = JSON.stringify({
        ...form,
        images: uploads.map(({ data, mediaType, label }) => ({ data, mediaType, label })),
        sources,
      });
      // 서버(Vercel) 요청 크기 한도 4.5MB
      if (payload.length > 4_300_000) throw new Error("첨부 파일이 너무 커요. 이미지나 PDF 수를 줄여 주세요.");
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성에 실패했어요.");
      setSpec(data.spec);
      setUsedImages(uploads.map((u) => u.src));
      setIsDemo(false);
      clearVoices();
      if (narrationOn) await synthesize(data.spec, voiceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성에 실패했어요.");
    } finally {
      setLoading(false);
    }
  };

  const download = async () => {
    setRenderPct(0);
    setError("");
    try {
      const { renderMediaOnWeb } = await import("@remotion/web-renderer");
      const result = await renderMediaOnWeb({
        composition: { id: "ShortVideo", component: ShortVideo, width: WIDTH, height: HEIGHT, fps: FPS, durationInFrames: duration, defaultProps: { spec: shownSpec, images: usedImages, bgm, sfx, voices } },
        inputProps: { spec: shownSpec, images: usedImages, bgm, sfx, voices },
        container: "mp4",
        onProgress: (p) => setRenderPct(p.progress),
      });
      const blob = await result.getBlob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${spec.brandName || "shortform"}.mp4`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(`MP4 변환 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRenderPct(null);
    }
  };

  const canSubmit = form.brandName.trim() && (form.details.trim() || sources.length > 0) && !loading;

  if (authed === null) return <main className="min-h-screen" />;
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8 font-title">
        <p className="text-sm font-bold text-violet-600">AI 숏폼 메이커</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">입력만 하면 자료가 영상이 돼요!</h1>
        <p className="mt-2 text-zinc-500">내용을 적으면 AI가 장면 구성·컬러·모션을 디자인하고 1분 세로 영상으로 만들어요.</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <section className="space-y-5 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-100 sm:p-8">
          <Field label="제목 / 상품명" required>
            <input className={input} value={form.brandName} onChange={(e) => set("brandName", e.target.value)} placeholder="예) 든든 연금보험, 11월 보험 소식" />
          </Field>
          <Field label="한 줄 요약">
            <input className={input} value={form.oneLiner} onChange={(e) => set("oneLiner", e.target.value)} placeholder="예) 금리가 떨어져도 바뀌지 않는 확정 이율" />
          </Field>
          <Field label="자료 내용" required hint="글을 붙여넣거나, 안내문·소식지 캡처 이미지나 PDF를 올려도 돼요">
            <textarea
              className={`${input} min-h-36 resize-y`}
              value={form.details}
              onChange={(e) => set("details", e.target.value)}
              placeholder="예) 10년만 납입하면 평생 연금을 받는 상품입니다. 납입 기간에는 연 6%, 완납 후 연금 개시 전까지는 연 4% 확정 이율이 연금 계산 기준금액에 적용됩니다…"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {sources.map((f, i) => (
                <span key={i} className="flex items-center gap-1.5 rounded-full bg-violet-50 py-1.5 pr-2 pl-3 text-xs font-bold text-violet-700">
                  {f.mediaType === "application/pdf" ? "PDF" : f.mediaType === "text/plain" ? "문서" : "IMG"} · <span className="max-w-40 truncate font-semibold">{f.name}</span>
                  <button type="button" onClick={() => setSources((list) => list.filter((_, j) => j !== i))} className="grid size-4 place-items-center rounded-full bg-violet-200 text-[10px]" aria-label="삭제">
                    ✕
                  </button>
                </span>
              ))}
              {sources.length < MAX_SOURCES && (
                <label className="cursor-pointer rounded-full border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-bold text-zinc-500 transition hover:border-violet-400 hover:text-violet-600">
                  {reading ? "파일 읽는 중…" : "+ 자료 파일 (이미지·PDF·Word·PPT·HWPX)"}
                  <input type="file" accept={SOURCE_ACCEPT} multiple className="hidden" onChange={(e) => { addSources(e.target.files); e.target.value = ""; }} />
                </label>
              )}
            </div>
            {sourceMsg && <p className="mt-2 whitespace-pre-line rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{sourceMsg}</p>}
          </Field>
          <Field label="강조할 숫자·조건" hint="있을 때만 그래프·숫자 장면이 들어가요. AI는 숫자를 지어내지 않아요">
            <textarea
              className={`${input} min-h-24 resize-y`}
              value={form.numbers}
              onChange={(e) => set("numbers", e.target.value)}
              placeholder={"예) 납입 10년 연 6% 확정, 완납 후 연 4% 확정\n최대 한도 원금의 350% (1형 기준)\n월 83만원 × 10년 → 55세 1.66억 / 60세 2.01억 / 65세 2.45억"}
            />
          </Field>
          <Field label="이미지" hint={`캐릭터·상품 이미지·로고 등 최대 ${MAX_IMAGES}장 · AI가 보고 어울리는 장면에 넣어요`}>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {uploads.map((u, i) => (
                <div key={i} className="group relative">
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-[repeating-conic-gradient(#f1f1f4_0_25%,#fff_0_50%)] bg-[length:16px_16px] ring-1 ring-zinc-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u.src} alt="" className="h-full w-full object-contain" />
                    {cutting[i] ? (
                      <div className="absolute inset-0 grid place-items-center bg-white/80 px-1 text-center text-[11px] font-bold text-violet-700">{cutting[i]}</div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => (u.original ? restoreOriginal(i) : cutBackground(i))}
                        className="absolute inset-x-1.5 bottom-1.5 rounded-lg bg-zinc-900/75 py-1 text-[11px] font-bold text-white backdrop-blur transition hover:bg-zinc-900"
                      >
                        {u.original ? "↺ 원본으로" : "✂ 배경 지우기"}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploads((list) => list.filter((_, j) => j !== i))}
                    disabled={!!cutting[i]}
                    className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-zinc-900 text-xs font-bold text-white"
                    aria-label="삭제"
                  >
                    ✕
                  </button>
                  <input
                    value={u.label}
                    onChange={(e) => setUploads((list) => list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    placeholder="설명(선택)"
                    className="mt-1.5 w-full rounded-lg bg-zinc-50 px-2 py-1 text-xs outline-none ring-1 ring-zinc-200 focus:ring-violet-400"
                  />
                </div>
              ))}
              {uploads.length < MAX_IMAGES && (
                <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border-2 border-dashed border-zinc-200 text-center text-xs font-bold text-zinc-400 transition hover:border-violet-400 hover:text-violet-500">
                  <span>
                    <span className="block text-2xl leading-none">+</span>
                    사진 추가
                  </span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                </label>
              )}
            </div>
          </Field>
          <Field label="테마" hint="만든 뒤에도 바로 바꿀 수 있어요">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {[{ id: "ai", name: "AI 추천", theme: spec.theme }, ...THEMES].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setThemeId(t.id)}
                  className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-bold transition ${
                    themeId === t.id ? "bg-violet-50 text-violet-700 ring-2 ring-violet-500" : "bg-zinc-50 text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100"
                  }`}
                >
                  <span className="relative size-6 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10" style={{ background: t.theme.background }}>
                    <span className="absolute inset-y-0 right-0 w-1/2" style={{ background: t.theme.primary }} />
                    <span className="absolute right-0 bottom-0 size-2.5" style={{ background: t.theme.accent }} />
                  </span>
                  <span className="truncate">{t.name}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field label="배경음악" hint="누르면 미리 들어볼 수 있어요 · 영상 길이에 맞춰 반복돼요">
            {(["잔잔", "발랄"] as const).map((group) => (
              <div key={group} className="mb-2 flex flex-wrap items-center gap-2">
                <span className="w-8 text-xs font-bold text-zinc-400">{group}</span>
                {BGM_PRESETS.filter((m) => m.group === group).map((m) => {
                  const active = bgmFile?.src === `/bgm/${m.id}.mp3`;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => pickPreset(m.id)}
                      className={`rounded-xl px-3 py-2 text-left text-xs font-bold transition ${
                        active ? "bg-violet-50 text-violet-700 ring-2 ring-violet-500" : "bg-zinc-50 text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100"
                      }`}
                    >
                      ♪ {m.name}
                      <span className="ml-1 font-medium text-zinc-400">{m.mood}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-8" />
              <button
                type="button"
                onClick={() => pickPreset("")}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                  !bgmFile ? "bg-violet-50 text-violet-700 ring-2 ring-violet-500" : "bg-zinc-50 text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100"
                }`}
              >
                없음
              </button>
              <label
                className={`cursor-pointer rounded-xl px-3 py-2 text-xs font-bold transition ${
                  bgmFile?.uploaded ? "bg-violet-50 text-violet-700 ring-2 ring-violet-500" : "border border-dashed border-zinc-300 text-zinc-500 hover:border-violet-400 hover:text-violet-600"
                }`}
              >
                {bgmFile?.uploaded ? `♪ ${bgmFile.name}` : "+ 내 음악 올리기"}
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => { pickBgm(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </div>
            {bgmFile && (
              <label className="mt-3 flex max-w-xs items-center gap-3 text-xs text-zinc-500">
                볼륨
                <input type="range" min={0} max={1} step={0.05} value={bgmVolume} onChange={(e) => setBgmVolume(Number(e.target.value))} className="flex-1 accent-violet-600" />
                <span className="w-8 text-right tabular-nums">{Math.round(bgmVolume * 100)}</span>
              </label>
            )}
          </Field>

          <Field label="장면 전환 효과음">
            <div className="flex gap-2">
              {([["whoosh", "휙"], ["pop", "톡"], ["none", "끄기"]] as const).map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setSfx(id);
                    if (id !== "none") preview(`/sfx/${id}.mp3`, 1);
                  }}
                  className={`rounded-xl px-5 py-2 text-xs font-bold transition ${
                    sfx === id ? "bg-violet-50 text-violet-700 ring-2 ring-violet-500" : "bg-zinc-50 text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </Field>

          <Field label="AI 내레이션" hint="장면마다 AI가 대본을 쓰고 목소리로 읽어요 · 목소리를 누르면 미리 들어볼 수 있어요">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setNarrationOn((on) => !on)}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition ${narrationOn ? "bg-violet-600 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}
              >
                {narrationOn ? "켜짐" : "꺼짐"}
              </button>
              {narrationOn &&
                VOICES.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => playSample(v.id)}
                    className={`rounded-xl px-3 py-2 text-left text-xs font-bold transition ${
                      voiceId === v.id ? "bg-violet-50 text-violet-700 ring-2 ring-violet-500" : "bg-zinc-50 text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100"
                    }`}
                  >
                    {v.id}
                    <span className="ml-1 font-medium text-zinc-400">{v.label}</span>
                  </button>
                ))}
            </div>
            {narrationOn && spec.scenes.some((s) => s.narration) && voicedWith !== voiceId && (
              <button type="button" onClick={revoice} disabled={loading} className="mt-3 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-700 disabled:bg-zinc-300">
                {voicedWith ? `${voiceId} 목소리로 다시 입히기` : "지금 영상에 목소리 입히기"}
              </button>
            )}
            {!narrationOn && voices.length > 0 && (
              <button type="button" onClick={clearVoices} className="mt-3 rounded-xl bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-200">
                지금 영상에서 목소리 빼기
              </button>
            )}
          </Field>

          <Field label="추가 요청" hint="AI가 가장 먼저 반영해요">
            <textarea
              className={`${input} min-h-20 resize-y`}
              value={form.requests}
              onChange={(e) => set("requests", e.target.value)}
              placeholder={"예) 캐릭터가 모든 화면에서 또잉또잉 튀게 해줘\n마지막에 상담 문의를 크게 강조해줘"}
            />
          </Field>

          <button
            onClick={generate}
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-violet-600 py-4 text-lg font-extrabold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {loading ? "AI가 디자인하는 중… (30초~1분)" : "AI로 영상 만들기"}
          </button>
          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}
        </section>

        <aside className="lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:self-start lg:overflow-y-auto">
          <div className="mx-auto w-full max-w-[360px]">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-bold">{loading ? "AI가 디자인하는 중" : isDemo ? "데모 미리보기" : spec.brandName}</span>
              <span className="text-zinc-400">{loading ? "1080×1920" : `${Math.round(duration / FPS)}초 · 1080×1920`}</span>
            </div>
            <div className="overflow-hidden rounded-3xl shadow-xl ring-1 ring-zinc-200">
              {loading ? <GeneratingSkeleton pct={voicePct !== null ? 0.8 + 0.2 * voicePct : narrationOn ? genPct * 0.84 : genPct} label={voicePct !== null ? "목소리 입히는 중" : undefined} /> : <PreviewPlayer spec={shownSpec} images={usedImages} bgm={bgm} sfx={sfx} voices={voices} />}
            </div>
            <button
              onClick={download}
              disabled={renderPct !== null || loading}
              className="mt-4 w-full rounded-2xl bg-zinc-900 py-3.5 font-extrabold text-white transition hover:bg-zinc-700 disabled:bg-zinc-400"
            >
              {renderPct === null ? "MP4 다운로드" : `변환 중… ${Math.round(renderPct * 100)}%`}
            </button>
            <p className="mt-2 text-center text-xs text-zinc-400">브라우저에서 바로 변환돼요 (Chrome 권장)</p>

          </div>
        </aside>
      </div>
      <footer className="mt-10 text-center text-xs text-zinc-400">
        <a href="https://github.com/jeonjay0323/Shortform_Maker" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          소스 코드
        </a>
      </footer>
    </main>
  );
}

const input =
  "w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[15px] outline-none transition placeholder:text-zinc-400 focus:border-violet-500 focus:bg-white";

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-bold">
          {label}
          {required && <span className="text-violet-600"> *</span>}
        </span>
        {hint && <span className="text-xs text-zinc-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    setBusy(false);
    if (res.ok) onSuccess();
    else setError("비밀번호가 맞지 않아요.");
  };

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-sm ring-1 ring-zinc-100">
        <div className="font-title">
          <p className="text-sm font-bold text-violet-600">AI 숏폼 메이커</p>
          <h1 className="mt-1 text-2xl font-extrabold">접속 비밀번호</h1>
        </div>
        <p className="mt-1 text-sm text-zinc-500">처음 한 번만 입력하면 이 브라우저에서 계속 쓸 수 있어요.</p>
        <input type="password" autoFocus className={`${input} mt-6`} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" />
        {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
        <button disabled={!password || busy} className="mt-4 w-full rounded-2xl bg-violet-600 py-3.5 font-extrabold text-white transition hover:bg-violet-700 disabled:bg-zinc-300">
          {busy ? "확인 중…" : "입장하기"}
        </button>
      </form>
    </main>
  );
}

const GEN_STEPS = [
  { until: 0.2, label: "자료 읽는 중" },
  { until: 0.45, label: "장면 구성 중" },
  { until: 0.7, label: "컬러·모션 디자인 중" },
  { until: 1, label: "마무리 중" },
];

function GeneratingSkeleton({ pct, label }: { pct: number; label?: string }) {
  const step = label ? { label } : (GEN_STEPS.find((s) => pct < s.until) ?? GEN_STEPS[GEN_STEPS.length - 1]);
  const bar = "animate-pulse rounded-lg bg-zinc-200";
  return (
    <div className="relative flex aspect-[9/16] w-full flex-col bg-zinc-50 p-6">
      <div className={`${bar} h-5 w-20 rounded-full`} />
      <div className={`${bar} mt-4 h-7 w-3/4`} />
      <div className={`${bar} mt-2 h-7 w-1/2`} />
      <div className="mt-8 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm" style={{ animationDelay: `${i * 120}ms` }}>
            <div className="size-8 shrink-0 animate-pulse rounded-full bg-zinc-200" />
            <div className="flex-1 space-y-1.5">
              <div className={`${bar} h-3.5 w-1/3`} />
              <div className={`${bar} h-2.5 w-2/3`} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-bold text-zinc-700">{step.label}…</span>
          <span className="font-bold text-violet-600 tabular-nums">{Math.round(pct * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full rounded-full bg-violet-600 transition-[width] duration-200 ease-linear" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
