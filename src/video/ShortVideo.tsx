import React, { createContext, useContext } from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { sceneDuration, totalDuration, type Scene, type Theme, type VideoSpec } from "./spec";

// ── 테마 컨텍스트 ─────────────────────────────────────
type Ctx = { theme: Theme; spec: VideoSpec; images: string[] };
const ThemeCtx = createContext<Ctx | null>(null);
const useTheme = () => useContext(ThemeCtx)!.theme;
const useSpec = () => useContext(ThemeCtx)!.spec;
const useImage = (scene: Scene) => useContext(ThemeCtx)!.images[scene.image] as string | undefined;
const useMascotSrc = () => {
  const { spec, images } = useContext(ThemeCtx)!;
  return images[spec.mascot.image] as string | undefined;
};
const MASCOT_SIZE = 280;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const RADIUS = { round: 32, soft: 18, sharp: 4 } as const;
const SPRING = {
  bouncy: { damping: 11 },
  smooth: { damping: 22, overshootClamping: true },
  snappy: { damping: 16, mass: 0.6 },
} as const;

const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const rgb = (hex: string) => {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const mix = (hex: string, target: string, k: number) => {
  const a = rgb(hex);
  const b = rgb(target);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, "0")).join("");
};

// 글자로 쓰는 강조색은 바탕과 대비가 4.5:1이 될 때까지 밝히거나(다크) 어둡게(라이트) 보정
const readable = (color: string, bg: string) => {
  const target = luminance(bg) < 0.5 ? "#FFFFFF" : "#000000";
  let c = color;
  for (let k = 0.1; contrast(c, bg) < 4.5 && k <= 1; k += 0.1) c = mix(color, target, k);
  return c;
};

const palette = (t: Theme) => [t.primary, t.accent, t.accent2, t.primary, t.accent, t.accent2];

// ── 공통 모션 ─────────────────────────────────────────
const useEnter = (delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTheme();
  return spring({ frame: frame - delay, fps, config: SPRING[t.motion] });
};

const Pop: React.FC<{ delay?: number; from?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0,
  from = 60,
  children,
  style,
}) => {
  const p = useEnter(delay);
  return (
    <div style={{ opacity: Math.min(1, p), transform: `translateY(${(1 - p) * from}px)`, ...style }}>{children}</div>
  );
};

const SceneFade: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8, dur - 8, dur], [0, 1, 1, 0], clamp);
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

const useCount = (to: number, start: number, len = 40) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + len], [0, 1], clamp);
  const eased = 1 - Math.pow(1 - p, 3);
  return to * eased;
};

// 목표 숫자의 소수 자릿수를 그대로 유지 (1.36억이 1.4억으로 바뀌면 안 됨)
const fmt = (v: number, target: number) => {
  const decimals = (String(target).split(".")[1] ?? "").length;
  return v.toLocaleString("ko-KR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

// ── 텍스트 강조 ───────────────────────────────────────
const Highlighted: React.FC<{ text: string; highlight: string; color: string }> = ({ text, highlight, color }) => {
  if (!highlight || !text.includes(highlight)) return <>{text}</>;
  const i = text.indexOf(highlight);
  return (
    <>
      {text.slice(0, i)}
      <span style={{ color }}>{highlight}</span>
      {text.slice(i + highlight.length)}
    </>
  );
};

// 한 줄씩 순서대로 튀어나오는 제목
const TitleLines: React.FC<{ scene: Scene; delay?: number; step?: number; size: number; align?: "left" | "center" }> = ({
  scene,
  delay = 0,
  step = 10,
  size,
  align = "left",
}) => {
  const t = useTheme();
  // highlight가 여러 줄에 걸치면 줄 단위로 나눠서 칠한다
  const hlLines = scene.highlight.split("\n");
  return (
    <div style={{ fontSize: size, fontWeight: 800, lineHeight: 1.22, letterSpacing: -size * 0.035, color: t.ink, textAlign: align }}>
      {scene.title.split("\n").map((line, i) => {
        const hl = hlLines.find((h) => h && line.includes(h)) ?? "";
        return (
          <Pop key={i} delay={delay + i * step}>
            <Highlighted text={line} highlight={hl} color={readable(t.primary, t.background)} />
          </Pop>
        );
      })}
    </div>
  );
};

// ── 배경 ─────────────────────────────────────────────
const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const t = useTheme();
  const base = (
    <AbsoluteFill
      style={{ background: `linear-gradient(180deg, ${t.background} 0%, ${t.background} 55%, ${alpha(t.accent, t.mode === "dark" ? 0.12 : 0.08)} 100%)` }}
    />
  );
  const soft = t.mode === "dark" ? 0.22 : 0.18;

  if (t.backdrop === "rays") {
    const rays = Array.from({ length: 36 });
    return (
      <AbsoluteFill style={{ backgroundColor: t.background }}>
        {base}
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <svg width={2400} height={2400} style={{ position: "absolute", transform: `rotate(${frame * 0.12}deg)` }}>
            {rays.map((_, i) => {
              const a = (i / rays.length) * Math.PI * 2;
              return (
                <line
                  key={i}
                  x1={1200}
                  y1={1200}
                  x2={1200 + Math.cos(a) * 1200}
                  y2={1200 + Math.sin(a) * 1200}
                  stroke={alpha(t.primary, soft * 0.45)}
                  strokeWidth={16}
                />
              );
            })}
          </svg>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (t.backdrop === "grid" || t.backdrop === "dots") {
    const size = t.backdrop === "grid" ? 90 : 48;
    const shift = (frame * 0.4) % size;
    const line = alpha(t.primary, soft * 0.5);
    const backgroundImage =
      t.backdrop === "grid"
        ? `linear-gradient(${line} 2px, transparent 2px), linear-gradient(90deg, ${line} 2px, transparent 2px)`
        : `radial-gradient(${alpha(t.primary, soft * 0.9)} 3px, transparent 3px)`;
    return (
      <AbsoluteFill style={{ backgroundColor: t.background }}>
        {base}
        <AbsoluteFill style={{ backgroundImage, backgroundSize: `${size}px ${size}px`, backgroundPosition: `0 ${shift}px` }} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: t.background }}>
      {base}
      <div
        style={{
          position: "absolute",
          width: 1000,
          height: 1000,
          borderRadius: "50%",
          right: -420,
          top: -300 + Math.sin(frame / 50) * 24,
          background: `radial-gradient(circle, ${alpha(t.primary, soft)} 0%, ${alpha(t.primary, 0)} 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          borderRadius: "50%",
          left: -360,
          bottom: -220 + Math.cos(frame / 60) * 24,
          background: `radial-gradient(circle, ${alpha(t.accent2, soft)} 0%, ${alpha(t.accent2, 0)} 70%)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ── 부품 ─────────────────────────────────────────────
const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => {
  const t = useTheme();
  return (
    <div
      style={{
        background: t.surface,
        borderRadius: RADIUS[t.radius],
        boxShadow: t.mode === "dark" ? "0 10px 40px rgba(0,0,0,0.35)" : `0 10px 40px ${alpha(t.ink, 0.08)}`,
        padding: "34px 40px",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

const Badge: React.FC<{ text: string; solid?: boolean }> = ({ text, solid = true }) => {
  const t = useTheme();
  if (!text) return null;
  return (
    <div
      style={{
        display: "inline-block",
        background: solid ? t.primary : alpha(t.primary, 0.14),
        color: solid ? "#fff" : readable(t.primary, t.background),
        fontWeight: 800,
        fontSize: 32,
        padding: "10px 26px",
        borderRadius: t.radius === "sharp" ? 6 : 999,
        letterSpacing: 1,
      }}
    >
      {text}
    </div>
  );
};

const Header: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useTheme();
  return (
    <div style={{ position: "absolute", top: 170, left: 80, right: 80 }}>
      <Pop from={20}>
        <Badge text={scene.badge} />
      </Pop>
      <div style={{ marginTop: 28 }}>
        <TitleLines scene={scene} delay={4} step={6} size={76} />
      </div>
      {scene.subtitle && scene.type !== "bars" && (
        <Pop delay={14} style={{ marginTop: 20 }}>
          <div style={{ fontSize: 38, fontWeight: 600, color: t.sub }}>{scene.subtitle}</div>
        </Pop>
      )}
    </div>
  );
};

const Caption: React.FC<{ text: string; delay: number; color?: string }> = ({ text, delay, color }) => {
  const t = useTheme();
  const mascot = useMascotSrc();
  if (!text) return null;
  return (
    <Pop delay={delay} style={{ position: "absolute", bottom: mascot ? MASCOT_SIZE + 60 : 190, left: 80, right: 80 }}>
      <Card style={{ textAlign: "center", borderBottom: `8px solid ${color ?? t.accent}` }}>
        <div style={{ fontSize: 44, fontWeight: 800, color: t.ink, lineHeight: 1.35 }}>{text}</div>
      </Card>
    </Pop>
  );
};

// 업로드 이미지. 사진(cover)은 카드에 꽉 채워 천천히 줌, 누끼(contain)는 통통 튀어나와 둥실
const SceneImage: React.FC<{ src: string; fit: Scene["imageFit"]; width: number; height: number; delay?: number }> = ({
  src,
  fit,
  width,
  height,
  delay = 0,
}) => {
  const t = useTheme();
  const frame = useCurrentFrame();
  const p = useEnter(delay);
  if (fit === "contain") {
    return (
      <div style={{ width, height, transform: `scale(${0.6 + 0.4 * p}) translateY(${Math.sin(frame / 18) * 10}px)`, opacity: Math.min(1, p) }}>
        <Img
          src={src}
          style={{ width: "100%", height: "100%", objectFit: "contain", filter: `drop-shadow(0 24px 40px ${alpha(t.ink, 0.25)})` }}
        />
      </div>
    );
  }
  const zoom = interpolate(frame, [delay, delay + 200], [1.12, 1], clamp);
  return (
    <div
      style={{
        width,
        height,
        borderRadius: RADIUS[t.radius] * 1.4,
        overflow: "hidden",
        opacity: Math.min(1, p),
        transform: `translateY(${(1 - p) * 60}px)`,
        boxShadow: `0 24px 60px ${alpha(t.mode === "dark" ? "#000000" : t.ink, 0.25)}`,
      }}
    >
      <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }} />
    </div>
  );
};

// ── 장면들 ───────────────────────────────────────────
const Hook: React.FC<{ scene: Scene }> = ({ scene }) => {
  const img = useImage(scene);
  if (!img) {
    return (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 80 }}>
        <TitleLines scene={scene} size={124} align="center" />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ alignItems: "center", padding: "200px 80px 0" }}>
      <SceneImage src={img} fit={scene.imageFit} width={880} height={scene.imageFit === "cover" ? 820 : 760} />
      <div style={{ marginTop: 80 }}>
        <TitleLines scene={scene} delay={14} size={108} align="center" />
      </div>
    </AbsoluteFill>
  );
};

const Showcase: React.FC<{ scene: Scene }> = ({ scene }) => {
  const img = useImage(scene);
  const mascot = useMascotSrc();
  return (
    <AbsoluteFill>
      <Header scene={scene} />
      {img && (
        <div style={{ position: "absolute", top: 560, left: 80, right: 80, display: "flex", justifyContent: "center" }}>
          <SceneImage src={img} fit={scene.imageFit} width={920} height={(scene.caption ? 1000 : 1140) - (mascot ? 160 : 0)} delay={16} />
        </div>
      )}
      <Caption text={scene.caption} delay={60} />
    </AbsoluteFill>
  );
};

// 상품명·자료 제목을 크게 쓰고 강조색 밑줄이 그어지는 타이포 로고
const Wordmark: React.FC<{ text: string; size: number; delay?: number }> = ({ text, size, delay = 0 }) => {
  const t = useTheme();
  const frame = useCurrentFrame();
  const underline = interpolate(frame, [delay + 10, delay + 30], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
  return (
    <Pop delay={delay}>
      <div style={{ position: "relative", display: "inline-block", fontSize: size, fontWeight: 800, color: t.ink, letterSpacing: -size * 0.03, lineHeight: 1.15 }}>
        <div
          style={{
            position: "absolute",
            left: -12,
            right: -12,
            bottom: size * 0.04,
            height: size * 0.32,
            background: alpha(t.primary, 0.28),
            borderRadius: t.radius === "sharp" ? 2 : size * 0.08,
            transform: `scaleX(${underline})`,
            transformOrigin: "left",
          }}
        />
        <span style={{ position: "relative" }}>{text}</span>
      </div>
    </Pop>
  );
};

const Brand: React.FC<{ scene: Scene }> = ({ scene }) => {
  const spec = useSpec();
  const img = useImage(scene);
  const nameSize = spec.brandName.length > 10 ? 84 : 112;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: 80 }}>
      {img && (
        <div style={{ marginBottom: 50 }}>
          <SceneImage src={img} fit={scene.imageFit} width={scene.imageFit === "cover" ? 760 : 620} height={scene.imageFit === "cover" ? 560 : 620} />
        </div>
      )}
      <Pop delay={6}>
        <Badge text={scene.badge} solid={false} />
      </Pop>
      <div style={{ marginTop: 30 }}>
        <Wordmark text={spec.brandName} size={img ? nameSize * 0.75 : nameSize} delay={12} />
      </div>
      <div style={{ marginTop: img ? 40 : 70 }}>
        <TitleLines scene={scene} delay={30} step={12} size={img ? 72 : 84} align="center" />
      </div>
    </AbsoluteFill>
  );
};

const List: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useTheme();
  const colors = palette(t);
  const n = scene.items.length;
  const compact = n > 4;
  return (
    <AbsoluteFill>
      <Header scene={scene} />
      <div style={{ position: "absolute", top: 580, left: 80, right: 80, display: "flex", flexDirection: "column", gap: compact ? 18 : 26 }}>
        {scene.items.map((it, i) => (
          <Pop key={i} delay={30 + i * 45} from={80}>
            <Card style={{ display: "flex", alignItems: "center", gap: 30, borderLeft: `10px solid ${colors[i]}`, padding: compact ? "24px 36px" : "34px 40px" }}>
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: t.radius === "sharp" ? 8 : "50%",
                  background: colors[i],
                  color: "#fff",
                  fontSize: 38,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <div>
                <div style={{ fontSize: 48, fontWeight: 800, color: t.ink }}>{it.label}</div>
                {it.desc && <div style={{ fontSize: 32, fontWeight: 500, color: t.sub, marginTop: 6 }}>{it.desc}</div>}
              </div>
            </Card>
          </Pop>
        ))}
      </div>
      <Caption text={scene.caption} delay={30 + n * 45 + 10} />
    </AbsoluteFill>
  );
};

const BigStat: React.FC<{ value: number; unit: string; label: string; delay: number; color: string; size: number }> = ({
  value,
  unit,
  label,
  delay,
  color,
  size,
}) => {
  const t = useTheme();
  const v = useCount(value, delay + 6, 45);
  return (
    <Pop delay={delay} style={{ textAlign: "center" }}>
      <div style={{ fontSize: size, fontWeight: 800, color, letterSpacing: -size * 0.04, lineHeight: 1 }}>
        {fmt(v, value)}
        <span style={{ fontSize: size * 0.42, marginLeft: 8 }}>{unit}</span>
      </div>
      {label && <div style={{ fontSize: 38, fontWeight: 700, color: t.sub, marginTop: 20 }}>{label}</div>}
    </Pop>
  );
};

const Stat: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useTheme();
  const colors = palette(t);
  const [main, ...rest] = scene.items;
  const frame = useCurrentFrame();
  const ring = interpolate(frame, [36, 90], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Header scene={scene} />
      {main && (
        <div style={{ position: "absolute", top: 640, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", width: 640, height: 640, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width={640} height={640} style={{ position: "absolute", transform: "rotate(-90deg)" }}>
              <circle cx={320} cy={320} r={290} fill="none" stroke={alpha(t.primary, 0.12)} strokeWidth={28} />
              <circle
                cx={320}
                cy={320}
                r={290}
                fill="none"
                stroke={t.primary}
                strokeWidth={28}
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 290}
                strokeDashoffset={2 * Math.PI * 290 * (1 - ring)}
              />
            </svg>
            <BigStat value={main.value} unit={scene.unit} label={main.label} delay={30} color={readable(t.primary, t.background)} size={rest.length ? 150 : 180} />
          </div>
        </div>
      )}
      {rest.length > 0 && (
        <div style={{ position: "absolute", top: 1330, left: 80, right: 80, display: "flex", gap: 24 }}>
          {rest.map((it, i) => (
            <Card key={i} style={{ flex: 1, padding: "26px 20px" }}>
              <BigStat value={it.value} unit={scene.unit} label={it.label} delay={90 + i * 30} color={readable(colors[i + 1], t.surface)} size={84} />
            </Card>
          ))}
        </div>
      )}
      <Caption text={scene.caption} delay={110 + rest.length * 30} />
    </AbsoluteFill>
  );
};

const Bar: React.FC<{ label: string; value: number; max: number; unit: string; color: string; delay: number }> = ({
  label,
  value,
  max,
  unit,
  color,
  delay,
}) => {
  const t = useTheme();
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + 30], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
  const v = useCount(value, delay, 30);
  const pct = max > 0 ? value / max : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, opacity: Math.min(1, p * 3) }}>
      <div style={{ width: 170, fontSize: 36, fontWeight: 800, color: t.ink, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 84, position: "relative" }}>
        <div
          style={{
            width: `${Math.max(pct * p * 100, 4)}%`,
            height: "100%",
            borderRadius: t.radius === "sharp" ? 4 : 18,
            background: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingRight: 22,
            boxSizing: "border-box",
            color: "#fff",
            fontSize: 36,
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          {pct > 0.35 ? `${fmt(v, value)}${unit}` : ""}
        </div>
        {pct <= 0.35 && (
          <div style={{ position: "absolute", left: `calc(${Math.max(pct * p * 100, 4)}% + 16px)`, top: 20, fontSize: 36, fontWeight: 800, color: readable(color, t.surface) }}>
            {fmt(v, value)}
            {unit}
          </div>
        )}
      </div>
    </div>
  );
};

const Bars: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useTheme();
  const colors = palette(t);
  const max = Math.max(...scene.items.map((i) => i.value), 0);
  return (
    <AbsoluteFill>
      <Header scene={scene} />
      <Pop delay={20} style={{ position: "absolute", top: 600, left: 80, right: 80 }}>
        <Card style={{ padding: "44px 40px" }}>
          {scene.subtitle && <div style={{ fontSize: 32, fontWeight: 700, color: t.sub, marginBottom: 34 }}>{scene.subtitle}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
            {scene.items.map((it, i) => (
              <Bar key={i} label={it.label} value={it.value} max={max} unit={scene.unit} color={colors[i]} delay={40 + i * 35} />
            ))}
          </div>
        </Card>
      </Pop>
      <Caption text={scene.caption} delay={40 + scene.items.length * 35 + 20} />
    </AbsoluteFill>
  );
};

const Compare: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useTheme();
  const [before, after] = scene.items;
  const col = (it: (typeof scene.items)[number] | undefined, good: boolean, delay: number) => {
    if (!it) return null;
    const color = good ? readable(t.primary, t.surface) : t.sub;
    return (
      <Pop delay={delay} from={80} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <Card
          style={{
            height: "100%",
            boxSizing: "border-box",
            padding: "44px 30px 20px",
            border: good ? `5px solid ${t.primary}` : `5px solid transparent`,
            background: good ? t.surface : alpha(t.sub, t.mode === "dark" ? 0.15 : 0.08),
            boxShadow: good ? undefined : "none",
          }}
        >
          <div style={{ fontSize: 44, fontWeight: 800, color, textAlign: "center", marginBottom: 40 }}>{it.label}</div>
          {it.desc.split("\n").filter(Boolean).map((line, i) => (
            <Pop key={i} delay={delay + 20 + i * 14} from={20}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 30 }}>
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: "50%",
                    background: good ? t.primary : alpha(t.sub, 0.3),
                    color: "#fff",
                    fontSize: 28,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {good ? "✓" : "✕"}
                </div>
                <div style={{ fontSize: 36, fontWeight: good ? 800 : 600, color: good ? t.ink : t.sub, lineHeight: 1.3 }}>{line}</div>
              </div>
            </Pop>
          ))}
        </Card>
      </Pop>
    );
  };
  return (
    <AbsoluteFill>
      <Header scene={scene} />
      <div style={{ position: "absolute", top: 600, left: 80, right: 80, display: "flex", gap: 24 }}>
        {col(before, false, 24)}
        {col(after, true, 70)}
      </div>
      <Caption text={scene.caption} delay={170} />
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useTheme();
  const spec = useSpec();
  const img = useImage(scene);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: 80 }}>
      {img && (
        <div style={{ marginBottom: 60 }}>
          <SceneImage src={img} fit={scene.imageFit} width={scene.imageFit === "cover" ? 760 : 560} height={560} />
        </div>
      )}
      <TitleLines scene={scene} delay={6} step={10} size={96} align="center" />
      <div style={{ marginTop: 56 }}>
        <Wordmark text={spec.brandName} size={60} delay={30} />
      </div>
      {scene.caption && (
        <Pop delay={44} style={{ marginTop: 34 }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: t.sub }}>{scene.caption}</div>
        </Pop>
      )}
    </AbsoluteFill>
  );
};

// 모든 장면 구석에 따라다니는 캐릭터. 장면이 바뀔 때마다 퐁 튀어나온다
const Mascot: React.FC = () => {
  const spec = useSpec();
  const src = useMascotSrc();
  const frame = useCurrentFrame();
  const p = useEnter(6);
  if (!src) return null;
  const { position, motion } = spec.mascot;
  let transform = "";
  if (motion === "bounce") {
    const h = Math.abs(Math.sin((frame / 22) * Math.PI));
    const squash = h < 0.18 ? (0.18 - h) / 0.18 : 0;
    transform = `translateY(${-h * 70}px) scale(${1 + 0.14 * squash}, ${1 - 0.14 * squash})`;
  } else if (motion === "wiggle") {
    transform = `rotate(${Math.sin(frame / 6) * 9}deg)`;
  } else {
    transform = `translateY(${Math.sin(frame / 20) * 16}px)`;
  }
  return (
    <div
      style={{
        position: "absolute",
        bottom: 40,
        [position === "bottom-left" ? "left" : "right"]: 50,
        width: MASCOT_SIZE,
        height: MASCOT_SIZE,
        transform: `scale(${p})`,
        transformOrigin: "bottom center",
      }}
    >
      <div style={{ width: "100%", height: "100%", transform, transformOrigin: "bottom center" }}>
        <Img src={src} style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 16px 24px rgba(0,0,0,0.18))" }} />
      </div>
    </div>
  );
};

const VIEWS: Record<Scene["type"], React.FC<{ scene: Scene }>> = {
  hook: Hook,
  brand: Brand,
  list: List,
  stat: Stat,
  bars: Bars,
  compare: Compare,
  showcase: Showcase,
  outro: Outro,
};

const ProgressBar: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const t = useTheme();
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        height: 10,
        width: `${(frame / total) * 100}%`,
        background: `linear-gradient(90deg, ${t.primary}, ${t.accent})`,
      }}
    />
  );
};

export const ShortVideo: React.FC<{ spec: VideoSpec; images?: string[] }> = ({ spec, images = [] }) => {
  const total = totalDuration(spec);
  const starts = spec.scenes.map((_, i) => spec.scenes.slice(0, i).reduce((sum, s) => sum + sceneDuration(s), 0));
  return (
    <ThemeCtx.Provider value={{ theme: spec.theme, spec, images }}>
      <AbsoluteFill style={{ fontFamily: "Pretendard, sans-serif" }}>
        <Backdrop />
        {spec.scenes.map((s, i) => {
          const View = VIEWS[s.type];
          const dur = sceneDuration(s);
          return (
            <Sequence key={i} from={starts[i]} durationInFrames={dur}>
              <SceneFade dur={dur}>
                <View scene={s} />
                {s.image !== spec.mascot.image && <Mascot />}
              </SceneFade>
            </Sequence>
          );
        })}
        <ProgressBar total={total} />
      </AbsoluteFill>
    </ThemeCtx.Provider>
  );
};
