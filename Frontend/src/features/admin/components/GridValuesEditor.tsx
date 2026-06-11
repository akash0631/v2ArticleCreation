/**
 * GridValuesEditor
 * Admin "Grid Values" tab. Browse the allowed grid values by:
 *   Group (Construction & Fabric, …) → Attribute (M_FAB_DIV, …) → Major Category
 * Clicking a major category opens a modal listing every allowed value for that
 * (attribute, major category) pair, with delete buttons and an add input.
 *
 * Data: maj_cat_grid_values, via /api/admin/grid-values/*.
 */
import { useState } from 'react';
import { ChevronDown, Plus, Trash2, Search, Loader2, FolderTree, History, ArrowDownCircle, XCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
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
  getGridValueAttributes,
  getGridValueCategories,
  getGridValues,
  getGridValueAudit,
  addGridValue,
  deleteGridValue,
} from '../../../services/adminApi';

// Group colours — mirror the New Articles attribute card palette.
const GROUP_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  FAB: { bg: '#fff7ed', border: '#fb923c', text: '#9a3412' },
  BODY: { bg: '#ecfdf5', border: '#34d399', text: '#065f46' },
  'VA ACC.': { bg: '#fef9c3', border: '#facc15', text: '#854d0e' },
  'VA PRCS': { bg: '#fff1f2', border: '#fb7185', text: '#9f1239' },
  BUSINESS: { bg: '#f1f5f9', border: '#64748b', text: '#1e293b' },
};

interface ModalTarget {
  attribute: string;
  majorCategory: string;
}

// Pending edit that needs a remark before it commits.
type PendingAction =
  | { kind: 'add'; value: string }
  | { kind: 'delete'; id: number; value: string }
  | null;

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
  } catch { return iso; }
};

// ─── Values modal ─────────────────────────────────────────────────────────────
const ValuesModal: React.FC<{ target: ModalTarget; onClose: () => void }> = ({ target, onClose }) => {
  const qc = useQueryClient();
  const { attribute, majorCategory } = target;
  const [tab, setTab] = useState<'values' | 'history'>('values');
  const [newValue, setNewValue] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: values, isLoading } = useQuery({
    queryKey: ['grid-values', attribute, majorCategory],
    queryFn: () => getGridValues(attribute, majorCategory),
  });

  const { data: audit, isLoading: auditLoading } = useQuery({
    queryKey: ['grid-audit', attribute, majorCategory],
    queryFn: () => getGridValueAudit(attribute, majorCategory),
    enabled: tab === 'history',
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['grid-values', attribute, majorCategory] });
    qc.invalidateQueries({ queryKey: ['grid-categories', attribute] });    // value counts change
    qc.invalidateQueries({ queryKey: ['grid-audit', attribute, majorCategory] });
  };

  const startAdd = () => {
    const v = newValue.trim();
    if (!v) return;
    setRemarks('');
    setPending({ kind: 'add', value: v });
  };
  const startDelete = (id: number, value: string) => {
    setRemarks('');
    setPending({ kind: 'delete', id, value });
  };

  const confirm = async () => {
    const r = remarks.trim();
    if (!r || !pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'add') {
        await addGridValue(attribute, majorCategory, pending.value, r);
        setNewValue('');
        message.success(`Added "${pending.value}"`);
      } else {
        await deleteGridValue(pending.id, r);
        message.success(`Deleted "${pending.value}"`);
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
            <DialogTitle className="font-mono text-white">{attribute}</DialogTitle>
            <DialogDescription className="text-white/75">
              Allowed values for <strong className="text-white/90">{majorCategory}</strong>
            </DialogDescription>
          </DialogTitleBar>
          <DialogBody className="space-y-3">
            {/* Tabs */}
            <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-1">
              <TabBtn id="values">Values</TabBtn>
              <TabBtn id="history">
                <span className="inline-flex items-center gap-1"><History className="h-3.5 w-3.5" /> History</span>
              </TabBtn>
            </div>

            {tab === 'values' ? (
              <>
                {/* Add row */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a new value…"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); startAdd(); } }}
                    className="h-9"
                  />
                  <Button onClick={startAdd} disabled={busy || !newValue.trim()}>
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>

                <Spinner spinning={isLoading}>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {(values?.length ?? 0)} value{(values?.length ?? 0) !== 1 ? 's' : ''}
                  </div>
                  <ScrollArea className="max-h-[46vh]">
                    <div className="flex flex-col gap-1.5 pr-2">
                      {(values ?? []).map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5"
                        >
                          <span className="truncate text-[13px]" title={v.value}>{v.value}</span>
                          <button
                            type="button"
                            onClick={() => startDelete(v.id, v.value)}
                            disabled={busy}
                            aria-label={`Delete ${v.value}`}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {!isLoading && (values?.length ?? 0) === 0 && (
                        <Empty description="No values yet — add the first one above." className="my-6" />
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
                          <span className="font-mono text-[13px] font-semibold">{a.value}</span>
                        </div>
                        {a.remarks && <div className="mt-1 text-[12px] text-foreground">“{a.remarks}”</div>}
                        <div className="mt-1 text-[11px] text-muted-foreground">{a.by} · {fmtDate(a.at)}</div>
                      </div>
                    ))}
                    {!auditLoading && (audit?.length ?? 0) === 0 && (
                      <Empty description="No changes recorded yet for this attribute / category." className="my-6" />
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
          <DialogHeaderRemark pending={pending} attribute={attribute} majorCategory={majorCategory} />
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
              {pending?.kind === 'delete' ? 'Delete' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Small header for the remarks prompt (kept separate to read cleanly).
const DialogHeaderRemark: React.FC<{ pending: PendingAction; attribute: string; majorCategory: string }> = ({ pending, attribute, majorCategory }) => {
  if (!pending) return null;
  const verb = pending.kind === 'add' ? 'Add' : 'Delete';
  return (
    <div className="space-y-1">
      <DialogTitle className="text-base">{verb} value</DialogTitle>
      <DialogDescription>
        {verb} <strong className="font-mono text-foreground">{pending.value}</strong>{' '}
        {pending.kind === 'add' ? 'to' : 'from'}{' '}
        <span className="font-mono">{attribute}</span> / <span className="font-mono">{majorCategory}</span>.
        A remark is required and will be saved to the audit log.
      </DialogDescription>
    </div>
  );
};

// ─── Category list (lazy, per attribute) ──────────────────────────────────────
const CategoryList: React.FC<{
  attribute: string;
  filter: string;
  onPick: (majorCategory: string) => void;
}> = ({ attribute, filter, onPick }) => {
  const { data: cats, isLoading } = useQuery({
    queryKey: ['grid-categories', attribute],
    queryFn: () => getGridValueCategories(attribute),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading categories…
      </div>
    );
  }

  const lower = filter.trim().toLowerCase();
  const filtered = lower
    ? (cats ?? []).filter((c) => c.majorCategory.toLowerCase().includes(lower))
    : (cats ?? []);

  if (filtered.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {lower ? `No major categories match “${filter.trim()}”.` : 'No major categories with grid data.'}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {filtered.map((c) => (
        <button
          key={c.majorCategory}
          type="button"
          onClick={() => onPick(c.majorCategory)}
          className="flex items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-primary/5"
        >
          <span className="truncate font-mono">{c.majorCategory}</span>
          <Badge variant="secondary" className="shrink-0 text-[10px]">{c.count}</Badge>
        </button>
      ))}
    </div>
  );
};

// ─── Main editor ──────────────────────────────────────────────────────────────
export const GridValuesEditor: React.FC = () => {
  const [search, setSearch] = useState('');
  const [openGroup, setOpenGroup] = useState<string | undefined>(undefined);
  const [openAttr, setOpenAttr] = useState<string | undefined>(undefined);
  const [modal, setModal] = useState<ModalTarget | null>(null);

  const { data: groups, isLoading } = useQuery({
    queryKey: ['grid-attributes'],
    queryFn: getGridValueAttributes,
    staleTime: 5 * 60 * 1000,
  });

  const lower = search.trim().toLowerCase();
  const matchAttr = (gridKey: string, label: string) =>
    !lower || gridKey.toLowerCase().includes(lower) || label.toLowerCase().includes(lower);

  return (
    <div className="rounded-lg border border-border bg-background">
      {/* Search */}
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter attributes / major categories…"
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
          {/* Level 1 — Groups */}
          <Accordion type="single" collapsible value={openGroup} onValueChange={setOpenGroup}>
            {(groups ?? []).map((g) => {
              const style = GROUP_STYLE[g.group] ?? { bg: '#f8fafc', border: '#cbd5e1', text: '#334155' };
              // Keep the currently-open attribute visible even when the search term
              // targets a major-category code — so the same box filters its categories.
              const attrs = g.attributes.filter((a) => matchAttr(a.gridKey, a.label) || a.gridKey === openAttr);
              // When searching, hide groups with no matching attribute (unless this group is open).
              if (lower && attrs.length === 0 && g.group !== openGroup) return null;
              return (
                <AccordionItem
                  key={g.group}
                  value={g.group}
                  className="mb-2 overflow-hidden rounded-md border"
                  style={{ borderColor: style.border, background: style.bg }}
                >
                  <AccordionTrigger className="px-3 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <FolderTree className="h-4 w-4" style={{ color: style.text }} />
                      <strong className="text-[13px]" style={{ color: style.text }}>{g.label}</strong>
                      <Badge style={{ background: style.text }}>{g.attributes.length}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="bg-background/50 px-2 pb-2">
                    {/* Level 2 — Attributes */}
                    <Accordion type="single" collapsible value={openAttr} onValueChange={setOpenAttr}>
                      {attrs.map((a) => (
                        <AccordionItem
                          key={a.gridKey}
                          value={a.gridKey}
                          className="overflow-hidden border-b border-border last:border-b-0"
                        >
                          <AccordionTrigger className="px-2 py-2 hover:no-underline">
                            <div className="flex items-center gap-2">
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-mono text-[12px]">{a.gridKey}</span>
                              {a.label !== a.gridKey && (
                                <span className="text-[11px] text-muted-foreground">· {a.label}</span>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-1">
                            {/* Level 3 — Major categories (lazy) */}
                            {openAttr === a.gridKey && (
                              <CategoryList
                                attribute={a.gridKey}
                                filter={search}
                                onPick={(majorCategory) => setModal({ attribute: a.gridKey, majorCategory })}
                              />
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {!isLoading && (groups ?? []).length === 0 && (
            <Empty description="No grouped attributes found." className="my-10" />
          )}
        </div>
      </Spinner>

      {modal && <ValuesModal target={modal} onClose={() => setModal(null)} />}
    </div>
  );
};
