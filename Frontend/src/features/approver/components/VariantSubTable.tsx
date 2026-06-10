import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pencil, Trash2, Plus, Info } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Input,
  MultiSelect,
  Popconfirm,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Tag,
  Textarea,
  Tooltip,
  type DataTableColumn,
} from '@/shared/components/ui-tw';
import { message } from '@/lib/message';
import { APP_CONFIG } from '../../../constants/app/config';
import type { ApproverItem, MasterAttribute } from './ApproverTable';

const FALLBACK_COLORS = ['BLACK', 'WHITE', 'RED', 'NAVY', 'GREY', 'BLUE', 'GREEN'];

interface VariantSubTableProps {
  genericId: string;
  genericRecord: ApproverItem;
  onRefresh: () => void;
  attributes: MasterAttribute[];
  pathType?: 'old' | 'new' | 'rejected' | 'created';
}

// ── Edit variant modal ────────────────────────────────────────────────────────

interface VariantFormValues {
  variantSize?: string;
  variantColor?: string;
  yarn1?: string;
  yarn2?: string;
  weave?: string;
  mFab2?: string;
  fabricMainMvgr?: string;
  macroMvgr?: string;
  mainMvgr?: string;
  lycra?: string;
  neck?: string;
  neckDetails?: string;
  collar?: string;
  placket?: string;
  sleeve?: string;
  bottomFold?: string;
  frontOpenStyle?: string;
  pocketType?: string;
  fit?: string;
  pattern?: string;
  length?: string;
  fatherBelt?: string;
  childBelt?: string;
  printType?: string;
  printStyle?: string;
  printPlacement?: string;
  embroidery?: string;
  embroideryType?: string;
  patches?: string;
  patchesType?: string;
  wash?: string;
  shade?: string;
  composition?: string;
  finish?: string;
  gsm?: string;
  weight?: string;
  drawcord?: string;
  button?: string;
  zipper?: string;
  zipColour?: string;
  rate?: string;
  mrp?: string;
  vendorCode?: string;
  designNumber?: string;
  pptNumber?: string;
  articleDescription?: string;
}

interface EditVariantModalProps {
  open: boolean;
  variant: ApproverItem | null;
  attributes: MasterAttribute[];
  onClose: () => void;
  onSaved: () => void;
}

const TEXT_FIELDS: { name: keyof VariantFormValues; label: string }[] = [
  { name: 'yarn1', label: 'Yarn 1' },
  { name: 'yarn2', label: 'Yarn 2' },
  { name: 'weave', label: 'Weave' },
  { name: 'mFab2', label: 'M FAB 2' },
  { name: 'fabricMainMvgr', label: 'Fabric Main MVGR' },
  { name: 'macroMvgr', label: 'Macro MVGR' },
  { name: 'mainMvgr', label: 'Main MVGR' },
  { name: 'lycra', label: 'Lycra' },
  { name: 'neckDetails', label: 'Neck Details' },
  { name: 'collar', label: 'Collar' },
  { name: 'placket', label: 'Placket' },
  { name: 'sleeve', label: 'Sleeve' },
  { name: 'bottomFold', label: 'Bottom Fold' },
  { name: 'frontOpenStyle', label: 'Front Open Style' },
  { name: 'pocketType', label: 'Pocket Type' },
  { name: 'fit', label: 'Fit' },
  { name: 'pattern', label: 'Pattern' },
  { name: 'length', label: 'Length' },
  { name: 'fatherBelt', label: 'Father Belt' },
  { name: 'childBelt', label: 'Child Belt' },
  { name: 'wash', label: 'Wash' },
  { name: 'shade', label: 'Shade' },
  { name: 'composition', label: 'Composition' },
  { name: 'finish', label: 'Finish' },
  { name: 'gsm', label: 'GSM' },
  { name: 'weight', label: 'Weight' },
  { name: 'printType', label: 'Print Type' },
  { name: 'printStyle', label: 'Print Style' },
  { name: 'printPlacement', label: 'Print Placement' },
  { name: 'embroidery', label: 'Embroidery' },
  { name: 'embroideryType', label: 'Embroidery Type' },
  { name: 'patches', label: 'Patches' },
  { name: 'patchesType', label: 'Patches Type' },
  { name: 'drawcord', label: 'Drawcord' },
  { name: 'button', label: 'Button' },
  { name: 'zipper', label: 'Zipper' },
  { name: 'zipColour', label: 'Zip Colour' },
  { name: 'rate', label: 'Rate' },
  { name: 'mrp', label: 'MRP' },
  { name: 'vendorCode', label: 'Vendor Code' },
  { name: 'designNumber', label: 'Design Number' },
  { name: 'pptNumber', label: 'PPT Number' },
];

const EditVariantModal: React.FC<EditVariantModalProps> = ({ open, variant, attributes, onClose, onSaved }) => {
  const form = useForm<VariantFormValues>({ defaultValues: {} });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && variant) {
      const v = variant;
      form.reset({
        variantSize: v.variantSize ?? '',
        variantColor: v.variantColor ?? '',
        yarn1: v.yarn1 ?? '',
        yarn2: v.yarn2 ?? '',
        weave: v.weave ?? '',
        mFab2: v.mFab2 ?? '',
        fabricMainMvgr: v.fabricMainMvgr ?? '',
        macroMvgr: v.macroMvgr ?? '',
        mainMvgr: v.mainMvgr ?? '',
        lycra: v.lycra ?? '',
        neck: v.neck ?? '',
        neckDetails: v.neckDetails ?? '',
        collar: v.collar ?? '',
        placket: v.placket ?? '',
        sleeve: v.sleeve ?? '',
        bottomFold: v.bottomFold ?? '',
        frontOpenStyle: v.frontOpenStyle ?? '',
        pocketType: v.pocketType ?? '',
        fit: v.fit ?? '',
        pattern: v.pattern ?? '',
        length: v.length ?? '',
        fatherBelt: v.fatherBelt ?? '',
        childBelt: v.childBelt ?? '',
        printType: v.printType ?? '',
        printStyle: v.printStyle ?? '',
        printPlacement: v.printPlacement ?? '',
        embroidery: v.embroidery ?? '',
        embroideryType: v.embroideryType ?? '',
        patches: v.patches ?? '',
        patchesType: v.patchesType ?? '',
        wash: v.wash ?? '',
        shade: v.shade ?? '',
        composition: v.composition ?? '',
        finish: v.finish ?? '',
        gsm: v.gsm ?? '',
        weight: v.weight ?? '',
        drawcord: v.drawcord ?? '',
        button: v.button ?? '',
        zipper: v.zipper ?? '',
        zipColour: v.zipColour ?? '',
        rate: v.rate != null ? String(v.rate) : '',
        mrp: v.mrp != null ? String(v.mrp) : '',
        vendorCode: v.vendorCode ?? '',
        designNumber: v.designNumber ?? '',
        pptNumber: v.pptNumber ?? '',
        articleDescription: v.articleDescription ?? '',
      });
    }
  }, [open, variant, form]);

  const onSubmit = async (values: VariantFormValues) => {
    if (!variant) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      const { variantSize: _omit, ...payload } = values;
      void _omit;
      const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items/${variant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const payload2 = await response.json().catch(() => null);
        throw new Error(payload2?.error || 'Failed to update variant');
      }
      message.success('Variant updated');
      onSaved();
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to update variant');
    } finally {
      setSaving(false);
    }
  };

  const neckOptions = attributes.find((a) => a.key === 'NECK')?.allowedValues ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-[720px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Variant{variant?.variantSize ? ` — Size ${variant.variantSize}` : ''}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="variantSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Size (read-only)</FormLabel>
                    <FormControl>
                      <Input disabled {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="variantColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. RED, NAVY BLUE" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="neck"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Neck</FormLabel>
                  <FormControl>
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {neckOptions.map((v) => (
                          <SelectItem key={v.shortForm} value={v.shortForm}>
                            {v.shortForm}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              {TEXT_FIELDS.map(({ name, label }) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              ))}
            </div>

            <FormField
              control={form.control}
              name="articleDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Article Description</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} value={field.value ?? ''} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

// ── Add Color modal ───────────────────────────────────────────────────────────

interface AddColorModalProps {
  open: boolean;
  genericId: string;
  existingColors: string[];
  sizeCount: number;
  attributes: MasterAttribute[];
  onClose: () => void;
  onAdded: () => void;
}

const AddColorModal: React.FC<AddColorModalProps> = ({
  open,
  genericId,
  existingColors,
  sizeCount,
  attributes,
  onClose,
  onAdded,
}) => {
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setSelectedColors([]);
  }, [open]);

  const handleOk = async () => {
    if (selectedColors.length === 0) {
      message.warning('Please select at least one color');
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items/${genericId}/add-color`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ colors: selectedColors }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to add color variants');
      }
      const result = await response.json();
      message.success(
        `${result.count} variant${result.count !== 1 ? 's' : ''} created for ${selectedColors.length} color${
          selectedColors.length !== 1 ? 's' : ''
        }`,
      );
      onAdded();
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to add colors');
    } finally {
      setSaving(false);
    }
  };

  const colorAttr = attributes.find(
    (a) =>
      a.key.toUpperCase() === 'COLOR' ||
      a.key.toLowerCase() === 'colour' ||
      a.label.toUpperCase() === 'COLOR' ||
      a.label.toUpperCase() === 'COLOUR',
  );
  const colorList =
    colorAttr && colorAttr.allowedValues.length > 0
      ? colorAttr.allowedValues.map((v) => ({ code: v.shortForm, label: v.fullForm }))
      : FALLBACK_COLORS.map((c) => ({ code: c, label: c }));

  const options = colorList.map(({ code, label }) => ({
    value: code,
    label: label !== code ? `${code} — ${label}` : code,
    disabled: existingColors.some(
      (ec) => ec.toUpperCase() === code.toUpperCase() || ec.toUpperCase() === label.toUpperCase(),
    ),
  }));

  const variantPreview =
    selectedColors.length > 0 && sizeCount > 0
      ? `${selectedColors.length} color${selectedColors.length > 1 ? 's' : ''} × ${sizeCount} sizes = ${
          selectedColors.length * sizeCount
        } variants`
      : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add Color Variants</DialogTitle>
        </DialogHeader>
        <p className="mb-3 text-sm text-muted-foreground">
          Select one or more colors. One variant will be created per size for each color.
        </p>

        <MultiSelect
          options={options}
          value={selectedColors}
          onChange={setSelectedColors}
          placeholder="Select colors…"
          searchable
          searchPlaceholder="Search colors…"
        />

        {variantPreview && (
          <div className="mt-2 rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1.5">
            <span className="text-[13px] text-emerald-700">
              Will create: <strong>{variantPreview}</strong>
            </span>
          </div>
        )}

        {existingColors.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            Already added:{' '}
            {existingColors.map((c) => (
              <Tag key={c} className="ml-1">
                {c}
              </Tag>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleOk} disabled={saving || selectedColors.length === 0}>
            {saving ? 'Adding…' : 'Add Colors'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Main VariantSubTable ──────────────────────────────────────────────────────

const VariantSubTable: React.FC<VariantSubTableProps> = ({
  genericId,
  genericRecord,
  attributes,
  onRefresh,
  pathType,
}) => {
  const [variants, setVariants] = useState<ApproverItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [editingVariant, setEditingVariant] = useState<ApproverItem | null>(null);
  const [addColorOpen, setAddColorOpen] = useState(false);
  const [majCatSizeCount, setMajCatSizeCount] = useState<number | null>(null);

  const fetchVariants = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items/${genericId}/variants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch variants');
      const result = await response.json();
      setVariants(result.data || result);
    } catch {
      message.error('Failed to load variants');
    } finally {
      setLoading(false);
    }
  }, [genericId]);

  useEffect(() => {
    fetchVariants();
  }, [fetchVariants]);

  useEffect(() => {
    const majCat = genericRecord.majorCategory;
    if (!majCat) return;
    const token = localStorage.getItem('authToken');
    fetch(`${APP_CONFIG.api.baseURL}/approver/sizes-for-majcat/${encodeURIComponent(majCat)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setMajCatSizeCount(d.count ?? null))
      .catch(() => setMajCatSizeCount(null));
  }, [genericRecord.majorCategory]);

  const existingColors = Array.from(
    new Set(variants.map((v) => v.variantColor).filter((c): c is string => Boolean(c))),
  );

  const sizeCount =
    majCatSizeCount ?? Array.from(new Set(variants.map((v) => v.variantSize).filter(Boolean))).length;

  const handleVariantSaved = useCallback(() => {
    fetchVariants();
  }, [fetchVariants]);

  const handleDeleteVariant = useCallback(
    async (variantId: string) => {
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items/${variantId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || 'Failed to delete variant');
        }
        message.success('Variant deleted');
        fetchVariants();
      } catch (err) {
        message.error(err instanceof Error ? err.message : 'Failed to delete variant');
      }
    },
    [fetchVariants],
  );

  const handleRetryVariants = useCallback(async () => {
    setRetrying(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${APP_CONFIG.api.baseURL}/approver/items/${genericId}/retry-variants`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Retry failed');
      message.success(data.message || `${data.synced} synced, ${data.failed} failed`);
      fetchVariants();
      onRefresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  }, [genericId, fetchVariants, onRefresh]);

  const columns: DataTableColumn<ApproverItem>[] = [
    {
      title: 'Size',
      dataIndex: 'variantSize',
      key: 'variantSize',
      width: 90,
      render: (v: string | null) => v || <span className="text-muted-foreground">—</span>,
    },
    {
      title: 'Color',
      dataIndex: 'variantColor',
      key: 'variantColor',
      width: 140,
      render: (v, record) => {
        const display = v || record.colour || genericRecord.colour;
        return display ? <Badge variant="info">{display}</Badge> : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      width: 100,
      render: (status: string) => {
        const variant: 'success' | 'destructive' | 'warning' =
          status === 'APPROVED' ? 'success' : status === 'REJECTED' ? 'destructive' : 'warning';
        return <Badge variant={variant}>{status || 'PENDING'}</Badge>;
      },
    },
    {
      title: 'Major Category',
      dataIndex: 'majorCategory',
      key: 'majorCategory',
      width: 160,
      render: (v) => v || <span className="text-muted-foreground">—</span>,
    },
    {
      title: 'Division',
      dataIndex: 'division',
      key: 'division',
      width: 100,
      render: (v) => v || <span className="text-muted-foreground">—</span>,
    },
    {
      title: 'Vendor',
      key: 'vendor',
      width: 140,
      render: (_v, record) =>
        record.vendorName || record.vendorCode || <span className="text-muted-foreground">—</span>,
    },
    {
      title: 'Rate',
      dataIndex: 'rate',
      key: 'rate',
      width: 80,
      render: (v) => (v != null ? String(v) : '—'),
    },
    {
      title: 'MRP',
      dataIndex: 'mrp',
      key: 'mrp',
      width: 80,
      render: (v) => (v != null ? String(v) : '—'),
    },
    {
      title: 'SAP Article #',
      dataIndex: 'sapArticleId',
      key: 'sapArticleId',
      width: 140,
      render: (sapId, record) => {
        if (sapId) return <strong className="text-xs text-emerald-700">{sapId}</strong>;
        const status = record.sapSyncStatus;
        if (status === 'FAILED') {
          return (
            <Tooltip title={record.sapSyncMessage || 'SAP returned an error'} side="top">
              <Badge variant="destructive" className="cursor-help gap-1 text-[11px]">
                FAILED <Info className="h-3 w-3" />
              </Badge>
            </Tooltip>
          );
        }
        if (status === 'SYNCED') return <Badge variant="warning" className="text-[11px]">SYNCED</Badge>;
        return <span className="text-[11px] text-muted-foreground">Pending SAP</span>;
      },
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      render: (_v, record) => (
        <div className="flex gap-1.5">
          {!record.fabricArticleNumber && (
            <Button size="sm" variant="outline" onClick={() => setEditingVariant(record)}>
              <Pencil />
              Edit
            </Button>
          )}
          {(!record.approvalStatus || record.approvalStatus === 'PENDING') && (
            <Popconfirm
              title="Delete variant?"
              description="This cannot be undone."
              onConfirm={() => handleDeleteVariant(record.id)}
              okText="Delete"
            >
              <Button size="sm" variant="destructive">
                <Trash2 />
              </Button>
            </Popconfirm>
          )}
        </div>
      ),
    },
  ];

  const handleSyncColor = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${APP_CONFIG.api.baseURL}/approver/items/${genericId}/sync-color`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.count > 0) {
        message.success(`Colour synced to ${data.count} variants`);
        fetchVariants();
      } else {
        message.info(data.message || 'Nothing to sync');
      }
    } catch {
      message.error('Failed to sync colour');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4">
        <Spinner size="sm" />
        <span className="text-sm text-muted-foreground">Loading variants…</span>
      </div>
    );
  }

  const retryNeededCount = variants.filter(
    (v) =>
      v.sapSyncStatus === 'FAILED' ||
      (v.approvalStatus === 'APPROVED' && v.sapSyncStatus === 'NOT_SYNCED') ||
      v.approvalStatus === 'PENDING',
  ).length;

  return (
    <div className="rounded-md bg-muted/30 p-4">
      <div className="mb-2 flex items-center justify-between">
        <strong className="text-[13px]">Variants ({variants.length})</strong>
        <div className="flex items-center gap-2">
          {genericRecord.colour && (
            <Button size="sm" variant="outline" onClick={handleSyncColor}>
              Sync Color
            </Button>
          )}
          {pathType === 'created' && retryNeededCount > 0 && (
            <Button size="sm" variant="destructive" disabled={retrying} onClick={handleRetryVariants}>
              {retrying ? 'Retrying…' : `Retry Variants to SAP (${retryNeededCount})`}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setAddColorOpen(true)}>
            <Plus />
            Add Color
          </Button>
        </div>
      </div>

      {variants.length === 0 ? (
        <span className="text-sm text-muted-foreground">
          No variants yet. Use "Add Color" to create color variants.
        </span>
      ) : (
        <DataTable<ApproverItem>
          columns={columns}
          dataSource={variants}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      )}

      <EditVariantModal
        open={!!editingVariant}
        variant={editingVariant}
        attributes={attributes}
        onClose={() => setEditingVariant(null)}
        onSaved={handleVariantSaved}
      />

      <AddColorModal
        open={addColorOpen}
        genericId={genericId}
        existingColors={existingColors}
        sizeCount={sizeCount}
        attributes={attributes}
        onClose={() => setAddColorOpen(false)}
        onAdded={handleVariantSaved}
      />
    </div>
  );
};

export default VariantSubTable;
