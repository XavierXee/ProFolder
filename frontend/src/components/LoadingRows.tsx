const COLUMN_WIDTHS = [14, 140, 96, 90, 64, 96, 80, 40, 56];
/** Placeholder width for an ordered tab's extra "#" column, inserted after the checkbox. */
const TRACK_NUMBER_WIDTH = 14;

/** `columns`: 9 for an Audio Files table, 10 with an ordered tab's "#" column. */
export default function LoadingRows({ columns = COLUMN_WIDTHS.length }: { columns?: number }) {
  const widths =
    columns > COLUMN_WIDTHS.length ? [COLUMN_WIDTHS[0]!, TRACK_NUMBER_WIDTH, ...COLUMN_WIDTHS.slice(1)] : COLUMN_WIDTHS;
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-white/5">
          {widths.map((w, j) => (
            <td key={j} className="px-4 py-3.5">
              <div className="skeleton h-3 rounded-[var(--rt-radius)]" style={{ width: `${w}px` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
