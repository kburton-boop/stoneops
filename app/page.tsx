import { Shell } from "@/components/shell/Shell";
import { OperatorCard } from "@/components/cards/OperatorCard";
import { CorrectiveActionsCard } from "@/components/cards/CorrectiveActionsCard";
import { SessionCard } from "@/components/cards/SessionCard";
import { AccountsKanbanCard } from "@/components/cards/AccountsKanbanCard";
import { FleetPulseCard } from "@/components/cards/FleetPulseCard";

export default function Home() {
  return (
    <Shell>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_280px]">
        <div className="space-y-4">
          <OperatorCard />
          <CorrectiveActionsCard />
        </div>
        <div className="space-y-4">
          <SessionCard />
          <AccountsKanbanCard />
        </div>
        <div className="space-y-4">
          <FleetPulseCard />
        </div>
      </div>
    </Shell>
  );
}
