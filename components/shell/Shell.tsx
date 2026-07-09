import type { ReactNode } from "react";
import { TopRail } from "./TopRail";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <TopRail />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
