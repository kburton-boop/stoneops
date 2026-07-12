import { NextResponse, type NextRequest } from "next/server";
import { deleteAccountCascade, getAccountDetail } from "@/lib/accounts/queries";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/accounts/[id]">) {
  const { id } = await ctx.params;
  const detail = await getAccountDetail(getUserId(), id);

  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/accounts/[id]">) {
  const { id } = await ctx.params;

  try {
    await deleteAccountCascade(getUserId(), id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Account not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (err instanceof Error && err.message === "PENDING_CONFIRMATION") {
      return NextResponse.json(
        {
          error:
            "This account is still an unconfirmed draft from a recent capture. Confirm or reject it first from the pending-confirmation prompt before deleting.",
        },
        { status: 409 },
      );
    }

    // Any other failure (RPC missing because the migration hasn't been
    // applied yet, an unexpected constraint violation, etc.) still needs to
    // come back as JSON — an uncaught throw here produces Next's HTML error
    // page, which breaks the client's res.json() and surfaces only a generic
    // "Delete failed" with no way to diagnose what actually went wrong.
    console.error(`DELETE /api/accounts/${id} failed:`, err);
    return NextResponse.json({ error: `Delete failed: ${describeError(err)}` }, { status: 500 });
  }
}

// Supabase's PostgrestError puts the actionable fix in `hint` far more
// often than in `message` (e.g. permission-denied errors return the exact
// GRANT statement in `hint`), so a bare `.message` frequently leaves out
// the one detail that would let you fix the problem without digging
// through server logs.
function describeError(err: unknown): string {
  if (err instanceof Error) {
    const hint = (err as Error & { hint?: string }).hint;
    return hint ? `${err.message} (hint: ${hint})` : err.message;
  }
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Unknown error";
}
