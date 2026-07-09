import { NextResponse } from "next/server";
import { getFocus, setFocus } from "@/lib/userFocus/queries";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function GET() {
  const focusText = await getFocus(getUserId());
  return NextResponse.json({ focus_text: focusText });
}

export async function DELETE() {
  await setFocus(getUserId(), null);
  return NextResponse.json({ ok: true });
}
