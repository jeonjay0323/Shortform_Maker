import type { Theme } from "./spec";

// 사용자가 고르는 테마. "AI 추천"은 설계도에 들어 있는 테마를 그대로 쓴다
export const THEMES: { id: string; name: string; theme: Theme }[] = [
  {
    id: "clean-blue",
    name: "클린 블루",
    theme: { mode: "light", background: "#F3F6FB", surface: "#FFFFFF", ink: "#14213D", sub: "#5E6B85", primary: "#1F5FBF", accent: "#F59E0B", accent2: "#10B981", backdrop: "grid", radius: "soft", motion: "smooth" },
  },
  {
    id: "lavender",
    name: "라벤더",
    theme: { mode: "light", background: "#F5F3FF", surface: "#FFFFFF", ink: "#1E1B3A", sub: "#6B6790", primary: "#6D4AFF", accent: "#FF6B9A", accent2: "#14B8A6", backdrop: "blobs", radius: "round", motion: "bouncy" },
  },
  {
    id: "mint",
    name: "민트",
    theme: { mode: "light", background: "#EFFAF5", surface: "#FFFFFF", ink: "#12261D", sub: "#587466", primary: "#0E9F6E", accent: "#FF8A3D", accent2: "#3B82F6", backdrop: "blobs", radius: "round", motion: "bouncy" },
  },
  {
    id: "coral",
    name: "코랄 팝",
    theme: { mode: "light", background: "#FFF5F1", surface: "#FFFFFF", ink: "#2A1712", sub: "#7D625A", primary: "#E9482F", accent: "#F5A30B", accent2: "#6C4DFF", backdrop: "dots", radius: "round", motion: "bouncy" },
  },
  {
    id: "pink",
    name: "핑크",
    theme: { mode: "light", background: "#FFF2F7", surface: "#FFFFFF", ink: "#2B1220", sub: "#7E5F70", primary: "#D93A7E", accent: "#8B5CF6", accent2: "#F59E0B", backdrop: "blobs", radius: "round", motion: "bouncy" },
  },
  {
    id: "navy",
    name: "네이비 다크",
    theme: { mode: "dark", background: "#0B1220", surface: "#17223A", ink: "#F2F5FB", sub: "#9AA6BF", primary: "#4F8DFD", accent: "#F5B83D", accent2: "#34D399", backdrop: "grid", radius: "soft", motion: "smooth" },
  },
  {
    id: "black-gold",
    name: "블랙 골드",
    theme: { mode: "dark", background: "#0D0D10", surface: "#1B1B21", ink: "#F7F3E8", sub: "#A89F8A", primary: "#D4A84B", accent: "#E9E1CC", accent2: "#8A7CFF", backdrop: "rays", radius: "sharp", motion: "smooth" },
  },
  {
    id: "neon",
    name: "네온 테크",
    theme: { mode: "dark", background: "#0A0A14", surface: "#171729", ink: "#F4F4FA", sub: "#9C9FB8", primary: "#8B5CF6", accent: "#22D3EE", accent2: "#F472B6", backdrop: "dots", radius: "sharp", motion: "snappy" },
  },
];
