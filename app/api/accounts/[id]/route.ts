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
    throw err;
  }
}
