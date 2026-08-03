import { DateInput } from "@/components/DateInput";

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  maxDate?: string;
  onStartChange: (d: string) => void;
  onEndChange: (d: string) => void;
}

const inputStyle = {
  border: "1px solid var(--line)",
  color: "var(--foreground)",
  background: "#fff",
  borderRadius: "var(--radius-sm)",
} as const;

export function DateRangeFilter({
  startDate,
  endDate,
  maxDate,
  onStartChange,
  onEndChange,
}: DateRangeFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[11px] uppercase"
        style={{ letterSpacing: "1.5px", color: "var(--muted-foreground)", fontWeight: 500 }}
      >
        De
      </span>
      <DateInput
        value={startDate}
        max={endDate}
        onChange={onStartChange}
        className="text-[12px] px-3 py-2 outline-none"
        style={inputStyle}
      />
      <span
        className="text-[11px] uppercase"
        style={{ letterSpacing: "1.5px", color: "var(--muted-foreground)", fontWeight: 500 }}
      >
        Até
      </span>
      <DateInput
        value={endDate}
        min={startDate}
        max={maxDate}
        onChange={onEndChange}
        className="text-[12px] px-3 py-2 outline-none"
        style={inputStyle}
      />
    </div>
  );
}
