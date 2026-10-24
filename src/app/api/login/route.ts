import { AUTH_COOKIE, AUTH_MAX_AGE, checkPassword, sessionToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = (await req.json()) as { password?: string };
  if (!password || !checkPassword(password)) {
    return Response.json({ error: "비밀번호가 맞지 않아요." }, { status: 401 });
  }
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": `${AUTH_COOKIE}=${sessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${AUTH_MAX_AGE}${secure}` } },
  );
}
