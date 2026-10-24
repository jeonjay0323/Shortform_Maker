"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { ShortVideo } from "@/video/ShortVideo";
import { SOURCE_ACCEPT, readSource, shrink, type Source, type Upload } from "@/lib/files";
import { DEMO_SPEC, FPS, HEIGHT, WIDTH, totalDuration, type VideoSpec } from "@/video/spec";

const PreviewPlayer = dynamic(() => import("@/components/PreviewPlayer"), {
  ssr: false,
  loading: () => <div className="aspect-[9/16] w-full animate-pulse bg-zinc-100" />,
});

const MOODS = ["신뢰감", "발랄함", "테크·힙", "고급스러움", "따뜻함"];

type Form = {
  brandName: string;
  oneLiner: string;
  details: string;
  numbers: string;
  mood: string;
  brandColor: string;
  useColor: boolean;
  requests: string;
};

const MAX_IMAGES = 6;
const MAX_SOURCES = 12;

const EMPTY: Form = { brandName: "", oneLiner: "", details: "", numbers: "", mood: "신뢰감", brandColor: "#6C4DFF", useColor: false, requests: "" };

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

  const duration = useMemo(() => totalDuration(spec), [spec]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const generate = async () => {
    setGenPct(0);
    setLoading(true);
    setError("");
    try {
      const payload = JSON.stringify({
        ...form,
        brandColor: form.useColor ? form.brandColor : "",
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
        composition: { id: "ShortVideo", component: ShortVideo, width: WIDTH, height: HEIGHT, fps: FPS, durationInFrames: duration, defaultProps: { spec, images: usedImages } },
        inputProps: { spec, images: usedImages },
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
                  <div className="aspect-square overflow-hidden rounded-xl bg-[repeating-conic-gradient(#f1f1f4_0_25%,#fff_0_50%)] bg-[length:16px_16px] ring-1 ring-zinc-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u.src} alt="" className="h-full w-full object-contain" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploads((list) => list.filter((_, j) => j !== i))}
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
          <Field label="분위기">
            <div className="flex flex-wrap gap-2">
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set("mood", m)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                    form.mood === m ? "bg-violet-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>
          <Field label="브랜드 컬러">
            <label className="flex items-center gap-3 text-sm text-zinc-600">
              <input type="checkbox" checked={form.useColor} onChange={(e) => set("useColor", e.target.checked)} className="size-4 accent-violet-600" />
              지정하기
              <input
                type="color"
                value={form.brandColor}
                disabled={!form.useColor}
                onChange={(e) => set("brandColor", e.target.value)}
                className="h-9 w-14 cursor-pointer rounded-lg border border-zinc-200 disabled:opacity-30"
              />
              {!form.useColor && <span className="text-zinc-400">AI가 골라요</span>}
            </label>
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

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="mx-auto w-full max-w-[360px]">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-bold">{loading ? "AI가 디자인하는 중" : isDemo ? "데모 미리보기" : spec.brandName}</span>
              <span className="text-zinc-400">{loading ? "1080×1920" : `${Math.round(duration / FPS)}초 · 1080×1920`}</span>
            </div>
            <div className="overflow-hidden rounded-3xl shadow-xl ring-1 ring-zinc-200">
              {loading ? <GeneratingSkeleton pct={genPct} /> : <PreviewPlayer spec={spec} images={usedImages} />}
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

function GeneratingSkeleton({ pct }: { pct: number }) {
  const step = GEN_STEPS.find((s) => pct < s.until) ?? GEN_STEPS[GEN_STEPS.length - 1];
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
