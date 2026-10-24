import { createHmac, timingSafeEqual } from "node:crypto";

// 최초 접속 때 비밀번호를 한 번 확인하고, 서명된 쿠키로 30일간 기억한다
export const AUTH_COOKIE = "sfm_auth";
export const AUTH_MAX_AGE = 60 * 60 * 24 * 30;

const passwords = () =>
  (process.env.ACCESS_PASSWORDS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const authEnabled = () => passwords().length > 0;

export const checkPassword = (input: string) => passwords().some((p) => same(p, input));

export const sessionToken = () => createHmac("sha256", process.env.AUTH_SECRET ?? "").update("sfm-session-v1").digest("hex");

export const isAuthed = (req: Request) => {
  if (!authEnabled()) return true;
  const cookie = req.headers.get("cookie") ?? "";
  const value = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${AUTH_COOKIE}=`))
    ?.slice(AUTH_COOKIE.length + 1);
  return !!value && same(value, sessionToken());
};
