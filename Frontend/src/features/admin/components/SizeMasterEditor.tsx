/**
 * SizeMasterEditor
 * Admin "Size Master" tab. Browse active sizes per Major Category.
 * Clicking a major category opens a modal listing every active size for that
 * category, with delete buttons and an add input. Every add/remove requires a
 * remark and is written to the maj_cat_sizes_audit log (who / why / when).
 *
 * Data: maj_cat_sizes, via /api/admin/size-master/*.
 */
import { useState } from 'react';
import { Plus, Trash2, Search, Loader2, Ruler, History, ArrowDownCircle, XCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitleBar,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Empty,
  Input,
  Textarea,
  ScrollArea,
  Spinner,
} from '@/shared/components/ui-tw';
import { message } from '@/lib/message';
import {
  getSizeMasterCategories,
  getSizeMasterSizes,
  getSizeMasterAudit,
  addSizeMasterSize,
  deleteSizeMasterSize,
} from '../../../services/adminApi';

// Pending edit that needs a remark before it commits.
type PendingAction =
  | { kind: 'add'; size: string }
  | { kind: 'delete'; id: number; size: string }
  | null;

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
  } catch { return iso; }
};

// ─── Sizes modal ──────────────────────────────────────────────────────────────
const SizesModal: React.FC<{ majorCategory: string; onClose: () => void }> = ({ majorCategory, onClose }) => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'values' | 'history'>('values');
  const [newSize, setNewSize] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: sizes, isLoading } = useQuery({
    queryKey: ['size-master-sizes', majorCategory],
    queryFn: () => getSizeMasterSizes(majorCategory),
  });

  const { data: audit, isLoading: auditLoading } = useQuery({
    queryKey: ['size-master-audit', majorCategory],
    queryFn: () => getSizeMasterAudit(majorCategory),
    enabled: tab === 'history',
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['size-master-sizes', majorCategory] });
    qc.invalidateQueries({ queryKey: ['size-master-categories'] });    // size counts change
    qc.invalidateQueries({ queryKey: ['size-master-audit', majorCategory] });
  };

  const startAdd = () => {
    const v = newSize.trim();
    if (!v) return;
    setRemarks('');
    setPending({ kind: 'add', size: v });
  };
  const startDelete = (id: number, size: string) => {
    setRemarks('');
    setPending({ kind: 'delete', id, size });
  };

  const confirm = async () => {
    const r = remarks.trim();
    if (!r || !pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'add') {
        await addSizeMasterSize(majorCategory, pending.size, r);
        setNewSize('');
        message.success(`Added "${pending.size}"`);
      } else {
        await deleteSizeMasterSize(pending.id, r);
        message.success(`Removed "${pending.size}"`);
      }
      refresh();
      setPending(null);
      setRemarks('');
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const TabBtn: React.FC<{ id: 'values' | 'history'; children: React.ReactNode }> = ({ id, children }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={
        'rounded-md px-3 py-1 text-[12px] font-medium transition-colors ' +
        (tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')
      }
    >
      {children}
    </button>
  );

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg gap-0 p-0">
          <DialogTitleBar>
            <DialogTitle className="font-mono text-white">{majorCategory}</DialogTitle>
            <DialogDescription className="text-white/75">
              Active sizes for this major category
            </DialogDescription>
          </DialogTitleBar>
          <DialogBody className="space-y-3">
            {/* Tabs */}
            <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-1">
              <TabBtn id="values">Sizes</TabBtn>
              <TabBtn id="history">
                <span className="inline-flex items-center gap-1"><History className="h-3.5 w-3.5" /> History</span>
              </TabBtn>
            </div>

            {tab === 'values' ? (
              <>
                {/* Add row */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a new size… (e.g. XL, 32, 7-8Y)"
                    value={newSize}
                    onChange={(e) => setNewSize(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); startAdd(); } }}
                    className="h-9"
                  />
                  <Button onClick={startAdd} disabled={busy || !newSize.trim()}>
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>

                <Spinner spinning={isLoading}>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {(sizes?.length ?? 0)} size{(sizes?.length ?? 0) !== 1 ? 's' : ''}
                  </div>
                  <ScrollArea className="max-h-[46vh]">
                    <div className="flex flex-col gap-1.5 pr-2">
                      {(sizes ?? []).map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5"
                        >
                          <span className="truncate text-[13px]" title={s.size}>{s.size}</span>
                          <button
                            type="button"
                            onClick={() => startDelete(s.id, s.size)}
                            disabled={busy}
                            aria-label={`Remove ${s.size}`}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {!isLoading && (sizes?.length ?? 0) === 0 && (
                        <Empty description="No sizes yet — add the first one above." className="my-6" />
                      )}
                    </div>
                  </ScrollArea>
                </Spinner>
              </>
            ) : (
              /* History tab */
              <Spinner spinning={auditLoading}>
                <ScrollArea className="max-h-[52vh]">
                  <div className="flex flex-col gap-2 pr-2">
                    {(audit ?? []).map((a) => (
                      <div key={a.id} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                        <div className="flex items-center gap-2">
                          {a.action === 'ADD'
                            ? <ArrowDownCircle className="h-4 w-4 text-emerald-600" />
                            : <XCircle className="h-4 w-4 text-rose-600" />}
                          <Badge variant={a.action === 'ADD' ? 'success' : 'destructive'} className="text-[10px]">
                            {a.action}
                          </Badge>
                          <span className="font-mono text-[13px] font-semibold">{a.size}</span>
                        </div>
                        {a.remarks && <div className="mt-1 text-[12px] text-foreground">“{a.remarks}”</div>}
                        <div className="mt-1 text-[11px] text-muted-foreground">{a.by} · {fmtDate(a.at)}</div>
                      </div>
                    ))}
                    {!auditLoading && (audit?.length ?? 0) === 0 && (
                      <Empty description="No changes recorded yet for this major category." className="my-6" />
                    )}
                  </div>
                </ScrollArea>
              </Spinner>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Remarks prompt — required before any add/delete commits */}
      <Dialog open={!!pending} onOpenChange={(o) => { if (!o && !busy) { setPending(null); setRemarks(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeaderRemark pending={pending} majorCategory={majorCategory} />
          <Textarea
            autoFocus
            placeholder="Reason for this change (required)…"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPending(null); setRemarks(''); }} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={confirm}
              disabled={busy || !remarks.trim()}
              variant={pending?.kind === 'delete' ? 'destructive' : 'default'}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pending?.kind === 'delete' ? 'Remove' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Small header for the remarks prompt (kept separate to read cleanly).
const DialogHeaderRemark: React.FC<{ pending: PendingAction; majorCategory: string }> = ({ pending, majorCategory }) => {
  if (!pending) return null;
  const verb = pending.kind === 'add' ? 'Add' : 'Remove';
  return (
    <div className="space-y-1">
      <DialogTitle className="text-base">{verb} size</DialogTitle>
      <DialogDescription>
        {verb} <strong className="font-mono text-foreground">{pending.size}</strong>{' '}
        {pending.kind === 'add' ? 'to' : 'from'}{' '}
        <span className="font-mono">{majorCategory}</span>.
        A remark is required and will be saved to the audit log.
      </DialogDescription>
    </div>
  );
};

// ─── Main editor ──────────────────────────────────────────────────────────────
export const SizeMasterEditor: React.FC = () => {
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<string | null>(null);

  const { data: cats, isLoading } = useQuery({
    queryKey: ['size-master-categories'],
    queryFn: getSizeMasterCategories,
    staleTime: 5 * 60 * 1000,
  });

  const lower = search.trim().toLowerCase();
  const filtered = lower
    ? (cats ?? []).filter((c) => c.majorCategory.toLowerCase().includes(lower))
    : (cats ?? []);
  const candidate = search.trim().toUpperCase();

  return (
    <div className="rounded-lg border border-border bg-background">
      {/* Search */}
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter major categories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            onClear={() => setSearch('')}
            className="h-9 pl-8"
          />
        </div>
      </div>

      <Spinner spinning={isLoading}>
        <div className="max-h-[70vh] overflow-y-auto p-2">
          {filtered.length > 0 ? (
            <div className="flex flex-col">
              {filtered.map((c) => (
                <button
                  key={c.majorCategory}
                  type="button"
                  onClick={() => setModal(c.majorCategory)}
                  className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[13px] transition-colors hover:bg-primary/5"
                >
                  <span className="inline-flex items-center gap-2 truncate font-mono">
                    <Ruler className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {c.majorCategory}
                  </span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">{c.count}</Badge>
                </button>
              ))}
            </div>
          ) : (
            !isLoading && (
              <div className="px-3 py-6">
                <Empty
                  description={lower ? `No major categories match “${search.trim()}”.` : 'No major categories with sizes.'}
                  className="my-2"
                />
                {lower && candidate && (
                  <div className="mt-2 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setModal(candidate)}
                      className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1 text-[12px] font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add sizes for <span className="font-mono">“{candidate}”</span>
                    </button>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </Spinner>

      {modal && <SizesModal majorCategory={modal} onClose={() => setModal(null)} />}
    </div>
  );
};
