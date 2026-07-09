import { getServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type UserFocusRow = Database["public"]["Tables"]["user_focus"]["Row"];

export async function getFocus(userId: string): Promise<string | null> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("user_focus")
    .select("focus_text")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.focus_text ?? null;
}

export async function setFocus(userId: string, focusText: string | null): Promise<UserFocusRow> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("user_focus")
    .upsert({ user_id: userId, focus_text: focusText, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
