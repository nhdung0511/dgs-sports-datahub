import { Placeholder } from "@/components/placeholder";

export default function NewGamePage() {
  return (
    <Placeholder
      title="New game"
      todo={[
        "Opponent name and date",
        "Format: quarters/halves, period length, overtime length (default FIBA 4×10, OT 5)",
        "Assign yourself as scorekeeper, then open the scoring screen",
      ]}
    />
  );
}
