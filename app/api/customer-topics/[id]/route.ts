import { NextResponse, type NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type CustomerTopicUpdate = Database["public"]["Tables"]["customer_topics"]["Update"];

const STATUS_VALUES = ["open", "discussed"] as const;
const COMMITMENT_OWNER_VALUES = ["me", "them"] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/customer-topics/[id]">) {
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
  const update: CustomerTopicUpdate = {};

  if (input.status !== undefined) {
    if (typeof input.status !== "string" || !STATUS_VALUES.includes(input.status as never)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = input.status as CustomerTopicUpdate["status"];
    update.discussed_at = input.status === "discussed" ? new Date().toISOString() : null;
  }

  if (input.description !== undefined) {
    if (input.description !== null && typeof input.description !== "string") {
      return NextResponse.json({ error: "Invalid description" }, { status: 400 });
    }
    update.description = input.description;
  }

  if (input.related_to !== undefined) {
    if (input.related_to !== null && typeof input.related_to !== "string") {
      return NextResponse.json({ error: "Invalid related_to" }, { status: 400 });
    }
    update.related_to = input.related_to;
  }

  if (input.due_date !== undefined) {
    if (input.due_date !== null && (typeof input.due_date !== "string" || !DATE_PATTERN.test(input.due_date))) {
      return NextResponse.json({ error: "Invalid due_date" }, { status: 400 });
    }
    update.due_date = input.due_date;
  }

  if (input.commitment_owner !== undefined) {
    if (input.commitment_owner !== null && !COMMITMENT_OWNER_VALUES.includes(input.commitment_owner as never)) {
      return NextResponse.json({ error: "Invalid commitment_owner" }, { status: 400 });
    }
    update.commitment_owner = input.commitment_owner as CustomerTopicUpdate["commitment_owner"];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("customer_topics")
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
