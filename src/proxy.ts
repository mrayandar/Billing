export { auth as proxy } from "@/auth";

// Runs on every page so the 30-minute idle timer slides while someone is working.
// The real access checks are in lib/session.ts, not here.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
