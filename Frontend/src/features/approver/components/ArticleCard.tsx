import type { ApproverItem } from './ApproverTable';

export interface ArticleCardProps {
  item: ApproverItem;
  index: number;
  onClick: (item: ApproverItem, index: number) => void;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  PENDING:  { bg: 'bg-amber-100',  text: 'text-amber-700' },
  APPROVED: { bg: 'bg-green-100',  text: 'text-green-700' },
  REJECTED: { bg: 'bg-red-100',    text: 'text-red-700'   },
  FAILED:   { bg: 'bg-red-100',    text: 'text-red-700'   },
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function ArticleCard({ item, index, onClick }: ArticleCardProps) {
  const statusKey = (item.approvalStatus ?? 'PENDING') as string;
  const s = STATUS_STYLES[statusKey] ?? STATUS_STYLES.PENDING;

  return (
    <div
      onClick={() => onClick(item, index)}
      className="group flex cursor-pointer flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      {/* Status + SAP tag */}
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.bg} ${s.text}`}>
          {statusKey}
        </span>
        {item.sapSyncStatus === 'SYNCED' && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">SAP ✓</span>
        )}
        {item.sapSyncStatus === 'FAILED' && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">SAP ✗</span>
        )}
      </div>

      {/* Thumbnail + division/category */}
      <div className="flex items-start gap-2">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt="article"
            className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-[9px] text-muted-foreground">
            No img
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {[item.division, item.subDivision].filter(Boolean).join(' › ') || '—'}
          </div>
          <div className="truncate text-[13px] font-bold text-foreground" title={item.majorCategory || undefined}>
            {item.majorCategory || '—'}
          </div>
        </div>
      </div>

      {/* Key fields */}
      <div className="space-y-1">
        <FieldRow label="Design" value={item.designNumber || item.articleNumber || '—'} />
        <FieldRow label="Vendor" value={item.vendorName || '—'} />
        <FieldRow label="Code"   value={item.vendorCode   || '—'} />
        <FieldRow label="Date"   value={formatDate(item.createdAt)} />
      </div>

      {/* Rate / MRP */}
      {(item.rate || item.mrp) && (
        <div className="flex items-center gap-3 border-t border-border pt-2">
          {item.rate && (
            <span className="text-[11px] text-muted-foreground">
              Cost <span className="font-semibold text-foreground">₹{item.rate}</span>
            </span>
          )}
          {item.mrp && (
            <span className="text-[11px] text-muted-foreground">
              MRP <span className="font-semibold text-foreground">₹{item.mrp}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="w-10 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium text-foreground" title={value !== '—' ? value : undefined}>
        {value}
      </span>
    </div>
  );
}
