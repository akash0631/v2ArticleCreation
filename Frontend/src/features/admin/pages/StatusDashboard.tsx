/**
 * Status Dashboard (Admin)
 * Generic-article counts by approval status (PENDING / APPROVED / REJECTED),
 * grouped Division → Sub-Division, read from extraction_results_flat.
 * Display-only: a searchable accordion of divisions, each expanding to its
 * sub-divisions with status count badges.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, CheckCircle2, XCircle, Layers, Search, Network, RefreshCw } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Card,
  CardContent,
  Empty,
  Input,
  Spinner,
} from '@/shared/components/ui-tw';
import { getStatusDashboard, type StatusCounts } from '../../../services/adminApi';

const nf = new Intl.NumberFormat('en-IN');

// ─── Status pills ───────────────────────────────────────────────────────────
const Pill: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  bg: string;
  border: string;
  text: string;
}> = ({ icon: Icon, label, value, bg, border, text }) => (
  <span
    className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-medium tabular-nums"
    style={{ background: bg, borderColor: border, color: text }}
    title={label}
  >
    <Icon className="h-3.5 w-3.5" />
    <span className="hidden sm:inline">{label}</span>
    <strong className="font-semibold">{nf.format(value)}</strong>
  </span>
);

const StatusPills: React.FC<{ counts: StatusCounts; compact?: boolean }> = ({ counts, compact }) => (
  <div className={'flex flex-wrap items-center gap-1.5 ' + (compact ? '' : 'justify-end')}>
    <Pill icon={Clock} label="Pending" value={counts.pending} bg="#fffbeb" border="#fcd34d" text="#92400e" />
    <Pill icon={CheckCircle2} label="Approved" value={counts.approved} bg="#ecfdf5" border="#6ee7b7" text="#065f46" />
    <Pill icon={XCircle} label="Rejected" value={counts.rejected} bg="#fef2f2" border="#fca5a5" text="#991b1b" />
    <Pill icon={Layers} label="Total" value={counts.total} bg="#f1f5f9" border="#cbd5e1" text="#334155" />
  </div>
);

// ─── Summary tile (top strip) ─────────────────────────────────────────────────
const Tile: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent: string;
}> = ({ icon: Icon, label, value, accent }) => (
  <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
    <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: accent + '22', color: accent }}>
      <Icon className="h-5 w-5" />
    </span>
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{nf.format(value)}</div>
    </div>
  </div>
);

export default function StatusDashboard() {
  const [search, setSearch] = useState('');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['status-dashboard'],
    queryFn: getStatusDashboard,
    staleTime: 60 * 1000,
  });

  const totals = data?.totals ?? { pending: 0, approved: 0, rejected: 0, total: 0 };

  const lower = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const divs = data?.data ?? [];
    if (!lower) return divs;
    return divs
      .map((d) => {
        const divMatch = d.division.toLowerCase().includes(lower);
        const subs = divMatch ? d.subDivisions : d.subDivisions.filter((s) => s.subDivision.toLowerCase().includes(lower));
        if (!divMatch && subs.length === 0) return null;
        return { ...d, subDivisions: subs };
      })
      .filter(Boolean) as typeof divs;
  }, [data?.data, lower]);

  return (
    <div className="page-scroll-enabled min-h-screen">
      <div className="p-6">
        <div className="mx-auto max-w-[1600px]">
          {/* Header */}
          <Card className="mb-6 glass card-3d rounded-2xl border border-white/60 overflow-hidden">
            <CardContent className="flex items-center justify-between gap-4 p-6">
              <div>
                <h1 className="m-0 text-2xl font-semibold">Status Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  Generic article counts by approval status, grouped by Division &amp; Sub-Division
                </p>
              </div>
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={'h-4 w-4 ' + (isFetching ? 'animate-spin' : '')} />
                Refresh
              </Button>
            </CardContent>
          </Card>

          {/* Totals strip */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile icon={Clock} label="Pending" value={totals.pending} accent="#d97706" />
            <Tile icon={CheckCircle2} label="Approved" value={totals.approved} accent="#059669" />
            <Tile icon={XCircle} label="Rejected" value={totals.rejected} accent="#dc2626" />
            <Tile icon={Layers} label="Total" value={totals.total} accent="#475569" />
          </div>

          {/* Accordion */}
          <Card className="glass rounded-2xl border border-white/60 overflow-hidden">
            <CardContent className="p-4">
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter divisions / sub-divisions…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  allowClear
                  onClear={() => setSearch('')}
                  className="h-9 pl-8"
                />
              </div>

              <Spinner spinning={isLoading}>
                <div className="max-h-[64vh] overflow-y-auto pr-1">
                  <Accordion type="multiple">
                    {filtered.map((d) => (
                      <AccordionItem
                        key={d.division}
                        value={d.division}
                        className="mb-2 overflow-hidden rounded-md border border-border bg-background"
                      >
                        <AccordionTrigger className="px-3 hover:no-underline">
                          <div className="flex flex-1 items-center justify-between gap-3 pr-2">
                            <span className="inline-flex items-center gap-2">
                              <Network className="h-4 w-4 text-muted-foreground" />
                              <strong className="text-[14px]">{d.division}</strong>
                              <span className="text-[11px] text-muted-foreground">
                                {d.subDivisions.length} sub-division{d.subDivisions.length !== 1 ? 's' : ''}
                              </span>
                            </span>
                            <StatusPills counts={d} />
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-3 pb-2">
                          <div className="flex flex-col divide-y divide-border">
                            {d.subDivisions.map((s) => (
                              <div
                                key={s.subDivision}
                                className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                              >
                                <span className="font-mono text-[13px] text-foreground">{s.subDivision}</span>
                                <StatusPills counts={s} />
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>

                  {!isLoading && filtered.length === 0 && (
                    <Empty
                      description={lower ? `No divisions match “${search.trim()}”.` : 'No generic articles found.'}
                      className="my-10"
                    />
                  )}
                </div>
              </Spinner>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
