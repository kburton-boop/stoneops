import { NextResponse, type NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type CorrectiveActionUpdate = Database["public"]["Tables"]["corrective_actions"]["Update"];

const SEVERITY_VALUES = ["hot", "warm", "resolved"] as const;

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/corrective-actions/[id]">) {
  const { id } = await ctx.params;
  const userId = getUserId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const update: CorrectiveActionUpdate = {};

  if (input.severity !== undefined) {
    if (typeof input.severity !== "string" || !SEVERITY_VALUES.includes(input.severity as never)) {
      return NextResponse.json({ error: "Invalid severity" }, { status: 400 });
    }
    update.severity = input.severity as CorrectiveActionUpdate["severity"];
    update.resolved_at = input.severity === "resolved" ? new Date().toISOString() : null;
  }

  if (input.resolution_notes !== undefined) {
    if (input.resolution_notes !== null && typeof input.resolution_notes !== "string") {
      return NextResponse.json({ error: "Invalid resolution_notes" }, { status: 400 });
    }
    update.resolution_notes = input.resolution_notes;
  }

  if (input.vendor_involved !== undefined) {
    if (input.vendor_involved !== null && typeof input.vendor_involved !== "string") {
      return NextResponse.json({ error: "Invalid vendor_involved" }, { status: 400 });
    }
    update.vendor_involved = input.vendor_involved;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("corrective_actions")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/corrective-actions/[id]">) {
  const { id } = await ctx.params;
  const userId = getUserId();

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("corrective_actions")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
