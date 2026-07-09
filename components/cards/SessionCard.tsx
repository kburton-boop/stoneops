import { Panel } from "@/components/shell/Panel";

const PLACEHOLDER_PRIORITIES: { id: string; title: string; account: string | null }[] = [
  { id: "1", title: "Confirm NTP-G FSC rate correction", account: "NTP-G Shear" },
  { id: "2", title: "Schedule DOT inspection, unit 22541", account: null },
  { id: "3", title: "Follow up on Matalco rate quote", account: "Matalco" },
];

export function SessionCard() {
  return (
    <Panel title="Session">
      <ol className="space-y-2">
        {PLACEHOLDER_PRIORITIES.map((item, index) => (
          <li key={item.id} className="flex gap-3 text-sm">
            <span className="font-mono text-ink-3">{index + 1}</span>
            <div>
              <p className="text-ink-4">{item.title}</p>
              {item.account && <p className="text-ink-3">{item.account}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
