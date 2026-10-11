import { useMemo } from "react";
import type { CycleTask } from "../../types";
import { useSystemStore } from "../../store/SystemStore";

/**
 * Objective 1 — the printable "blind count" sheet.
 *
 * Deliberately omits every system quantity: staff write what they physically
 * find, so the count cannot simply be copied from the screen. This is what
 * makes the workflow compliant with the warehouse's no-phone policy.
 *
 * Company details, branch name and part descriptions come from the store so
 * the printed sheet matches whatever the database actually holds.
 */
export function BlindCountSheet({
  branchId,
  tasks,
  sheetId,
  dateLabel,
}: {
  branchId: string;
  tasks: CycleTask[];
  sheetId: string;
  dateLabel?: string;
}) {
  const { branchById, partBySku, company, asOf } = useSystemStore();

  const branch = branchById(branchId);
  const branchName = branch?.name ?? branchId;

  /**
   * Format `asOf` from its date parts rather than `new Date(iso)`, which parses
   * a bare "YYYY-MM-DD" as UTC midnight and can render a day early west of
   * Greenwich.
   */
  const label = useMemo(() => {
    if (dateLabel) return dateLabel;
    const [year, month, day] = asOf.split("-").map(Number);
    if (!year || !month || !day) return asOf;
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [dateLabel, asOf]);

  const th = "py-2 text-[10px] font-semibold text-[#6c757d] uppercase tracking-wider text-left";
  const td = "py-2.5 text-[12px] text-[#1a1d23] align-middle";

  return (
    <div className="bg-white rounded border border-[#dee2e6] p-6 print:border-0 print:rounded-none print:p-0">
      <header className="flex items-start justify-between gap-6 border-b border-[#495057] pb-3 mb-4">
        <div>
          <div className="text-[14px] font-semibold text-[#1a1d23]">{company.name}</div>
          <div className="text-[12px] text-[#495057] mt-0.5">
            Targeted Cycle Count — Blind Count Sheet
          </div>
          <div className="text-[11px] text-[#6c757d] mt-1">
            Branch: <strong className="text-[#1a1d23]">{branchName}</strong> · Sheet {sheetId}
          </div>
        </div>
        <div className="text-right text-[11px] text-[#6c757d] shrink-0">
          <div className="text-[12px] text-[#1a1d23] font-medium">{label}</div>
          <div className="mt-1">{tasks.length} bins to count</div>
        </div>
      </header>

      <p className="text-[10px] text-[#6c757d] mb-3 italic">{company.noPhonePolicy}</p>

      <table className="w-full">
        <caption className="sr-only">
          Blind count sheet for {branchName}. Write the physically counted quantity for each bin.
        </caption>
        <thead>
          <tr className="border-y border-[#dee2e6] bg-[#f8f9fa]">
            <th scope="col" className={`${th} pl-2 w-8`}>#</th>
            <th scope="col" className={`${th} w-24`}>Bin</th>
            <th scope="col" className={`${th} w-32`}>SKU</th>
            <th scope="col" className={th}>Description</th>
            <th scope="col" className={`${th} w-20`}>Priority</th>
            <th scope="col" className={`${th} w-24 text-right pr-2`}>Counted Qty</th>
            <th scope="col" className={`${th} w-32 pl-4`}>Variance Notes</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, index) => {
            const part = partBySku(task.sku);
            return (
              <tr key={task.id} className="border-b border-[#e9ecef]">
                <td className={`${td} pl-2 text-[#6c757d]`}>{index + 1}</td>
                <td className={`${td} font-medium`} style={{ fontFamily: "'DM Mono', monospace" }}>
                  {task.binLocation}
                </td>
                <td className={`${td} text-[#0d6efd]`} style={{ fontFamily: "'DM Mono', monospace" }}>
                  {task.sku}
                </td>
                <td className={td}>
                  {part?.name ?? task.sku}
                  {part ? <span className="text-[#6c757d]"> — {part.brand}</span> : null}
                </td>
                <td className={`${td} text-[11px] text-[#495057]`}>{task.priority}</td>
                <td className="py-2.5 pr-2">
                  <div className="h-5 border-b border-dashed border-[#adb5bd]" />
                </td>
                <td className="py-2.5 pl-4">
                  <div className="h-5 border-b border-dashed border-[#adb5bd]" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <footer className="mt-8 flex items-end justify-between gap-10 text-[11px] text-[#6c757d]">
        <div className="flex-1">
          <div className="border-t border-[#495057] pt-1.5">Counted by — Warehouse Staff</div>
        </div>
        <div className="flex-1">
          <div className="border-t border-[#495057] pt-1.5">Verified by — Branch Manager</div>
        </div>
        <div className="flex-1">
          <div className="border-t border-[#495057] pt-1.5">Date &amp; Time</div>
        </div>
      </footer>

      <p className="mt-6 text-[10px] text-[#6c757d] leading-relaxed">
        Encoded counts that disagree with the system quantity will lock the inventory record and
        raise a discrepancy ticket. No stock adjustment takes effect until the branch manager
        approves it digitally.
      </p>
    </div>
  );
}
