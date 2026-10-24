import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "숏폼 메이커",
  description: "회사 소개를 입력하면 AI가 디자인하고 영상으로 만들어 줍니다",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
