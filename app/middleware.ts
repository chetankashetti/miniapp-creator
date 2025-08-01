import { NextResponse } from "next/server";

export function middleware() {
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "ALLOWALL");
  response.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'self' http://localhost:3000 http://yourhost.com;"
  );
  return response;
}
