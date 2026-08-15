type Props = {
  connected: boolean;
  lastScanChanges: number | null;
  isDark?: boolean;
};

export default function LiveIndicator({ connected, lastScanChanges, isDark = true }: Props) {
  const dotCls = connected ? "bg-emerald-500 pulse-dot" : isDark ? "bg-slate-600" : "bg-slate-400";
  const labelCls = isDark ? "text-slate-400" : "text-slate-600";

  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotCls}`} aria-hidden="true" />
      <span className={`text-xs font-mono ${labelCls}`}>{connected ? "Connected" : "Offline"}</span>
      {lastScanChanges !== null && lastScanChanges > 0 && (
        <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${isDark ? "text-blue-400 bg-blue-500/10" : "text-blue-700 bg-blue-100"}`}>
          +{lastScanChanges} from last scan
        </span>
      )}
    </div>
  );
}
