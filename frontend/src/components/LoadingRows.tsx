const COLUMN_WIDTHS = [140, 64, 96, 96, 80, 90, 56];

export default function LoadingRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-white/5">
          {COLUMN_WIDTHS.map((w, j) => (
            <td key={j} className="px-4 py-3.5">
              <div className="skeleton h-3 rounded" style={{ width: `${w}px` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
