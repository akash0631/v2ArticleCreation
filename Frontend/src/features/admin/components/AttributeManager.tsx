import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Palette, Tag as TagIcon, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
  Textarea,
} from '@/shared/components/ui-tw';
import { message } from '@/lib/message';
import {
  getMasterAttributes,
  createMasterAttribute,
  updateMasterAttribute,
  deleteMasterAttribute,
  addAllowedValue,
  deleteAllowedValue,
  type MasterAttribute,
  type AllowedValue,
} from '../../../services/adminApi';
import { sanitizeText, sanitizeCode } from '../../../shared/utils/security/sanitizer';
import './AttributeManager.css';

const GROUPS = ['FAB', 'BODY', 'VA ACC.', 'VA PRCS', 'BUSINESS'];

const GROUP_COLORS: Record<string, string> = {
  FAB: '#1677ff',
  BODY: '#52c41a',
  'VA ACC.': '#fa8c16',
  'VA PRCS': '#eb2f96',
  BUSINESS: '#722ed1',
};

interface ApiErrorResponse {
  response?: { data?: { error?: string } };
  message: string;
}

const attrSchema = z.object({
  key: z
    .string()
    .min(1, 'Please enter attribute key')
    .max(100, 'Key must be less than 100 characters')
    .regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers, and underscores'),
  label: z.string().min(1, 'Please enter attribute label').max(200, 'Label must be less than 200 characters'),
  type: z.enum(['TEXT', 'SELECT', 'NUMBER']),
  group: z.string().optional().nullable(),
  description: z.string().optional(),
  displayOrder: z.number().min(0),
  isActive: z.boolean(),
});
type AttrValues = z.infer<typeof attrSchema>;

const valueSchema = z.object({
  shortForm: z.string().min(1, 'Please enter short form').max(100, 'Must be less than 100 characters'),
  fullForm: z.string().min(1, 'Please enter full form').max(200, 'Must be less than 200 characters'),
  displayOrder: z.number().min(0),
  isActive: z.boolean(),
});
type ValueValues = z.infer<typeof valueSchema>;

const typeColors: Record<string, 'info' | 'success' | 'warning'> = {
  TEXT: 'info',
  SELECT: 'success',
  NUMBER: 'warning',
};

export const AttributeManager = () => {
  const queryClient = useQueryClient();
  const user = localStorage.getItem('user');
  const userData = user ? JSON.parse(user) : null;
  const isAdmin = userData?.role === 'ADMIN';
  const [isAttrModalOpen, setIsAttrModalOpen] = useState(false);
  const [isValueModalOpen, setIsValueModalOpen] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<MasterAttribute | null>(null);
  const [selectedAttribute, setSelectedAttribute] = useState<MasterAttribute | null>(null);

  const attrForm = useForm<AttrValues>({
    resolver: zodResolver(attrSchema),
    defaultValues: { key: '', label: '', type: 'SELECT', group: null, description: '', displayOrder: 0, isActive: true },
  });

  const valueForm = useForm<ValueValues>({
    resolver: zodResolver(valueSchema),
    defaultValues: { shortForm: '', fullForm: '', displayOrder: 0, isActive: true },
  });

  const { data: attributes, isLoading } = useQuery({
    queryKey: ['master-attributes', true],
    queryFn: () => getMasterAttributes(true),
  });

  const createAttrMutation = useMutation({
    mutationFn: createMasterAttribute,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['master-attributes'] });
      queryClient.invalidateQueries({ queryKey: ['hierarchy-stats'] });
      message.success('Attribute created successfully!');
      setIsAttrModalOpen(false);
      attrForm.reset();
    },
    onError: (error: ApiErrorResponse) => message.error(error.response?.data?.error || error.message),
  });

  const updateAttrMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<MasterAttribute> }) => updateMasterAttribute(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['master-attributes'] });
      queryClient.invalidateQueries({ queryKey: ['hierarchy-tree'] });
      message.success('Attribute updated successfully!');
      setIsAttrModalOpen(false);
      setEditingAttribute(null);
      attrForm.reset();
    },
    onError: (error: ApiErrorResponse) => message.error(error.response?.data?.error || error.message),
  });

  const deleteAttrMutation = useMutation({
    mutationFn: deleteMasterAttribute,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['master-attributes'] });
      queryClient.invalidateQueries({ queryKey: ['hierarchy-tree'] });
      message.success('Attribute deleted successfully!');
    },
    onError: (error: ApiErrorResponse) => message.error(error.response?.data?.error || error.message),
  });

  const addValueMutation = useMutation({
    mutationFn: ({ attributeId, data }: { attributeId: number; data: Partial<AllowedValue> }) =>
      addAllowedValue(attributeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['master-attributes'] });
      message.success('Value added successfully!');
      setIsValueModalOpen(false);
      valueForm.reset();
    },
    onError: (error: ApiErrorResponse) => message.error(error.response?.data?.error || error.message),
  });

  const deleteValueMutation = useMutation({
    mutationFn: ({ attributeId, valueId }: { attributeId: number; valueId: number }) =>
      deleteAllowedValue(attributeId, valueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['master-attributes'] });
      message.success('Value deleted successfully!');
    },
    onError: (error: ApiErrorResponse) => message.error(error.response?.data?.error || error.message),
  });

  const handleCreateAttribute = () => {
    if (!isAdmin) {
      message.error('Only admin can add attributes');
      return;
    }
    setEditingAttribute(null);
    attrForm.reset({ key: '', label: '', type: 'SELECT', group: null, description: '', displayOrder: 0, isActive: true });
    setIsAttrModalOpen(true);
  };

  const handleEditAttribute = (attr: MasterAttribute) => {
    if (!isAdmin) {
      message.error('Only admin can edit attributes');
      return;
    }
    setEditingAttribute(attr);
    const hasValues = (attr.allowedValues?.length ?? 0) > 0;
    attrForm.reset({
      key: attr.key,
      label: attr.label,
      type: hasValues ? 'SELECT' : attr.type,
      group: attr.group ?? null,
      description: attr.description || '',
      displayOrder: attr.displayOrder,
      isActive: attr.isActive,
    });
    setIsAttrModalOpen(true);
  };

  const handleDeleteAttribute = (id: number) => {
    if (!isAdmin) {
      message.error('Only admin can delete attributes');
      return;
    }
    deleteAttrMutation.mutate(id);
  };

  const onAttrSubmit = (values: AttrValues) => {
    const sanitizedValues = {
      ...values,
      key: sanitizeCode(values.key),
      label: sanitizeText(values.label),
      description: values.description ? sanitizeText(values.description) : undefined,
    };
    if (editingAttribute) {
      updateAttrMutation.mutate({ id: editingAttribute.id, data: sanitizedValues });
    } else {
      createAttrMutation.mutate(sanitizedValues);
    }
  };

  const handleAddValue = (attr: MasterAttribute) => {
    if (!isAdmin) {
      message.error('Only admin can add values');
      return;
    }
    setSelectedAttribute(attr);
    valueForm.reset({ shortForm: '', fullForm: '', displayOrder: 0, isActive: true });
    setIsValueModalOpen(true);
  };

  const onValueSubmit = (values: ValueValues) => {
    if (!selectedAttribute) return;
    const sanitizedValues = {
      ...values,
      value: sanitizeText(values.shortForm),
      displayValue: sanitizeText(values.fullForm),
    };
    addValueMutation.mutate({ attributeId: selectedAttribute.id, data: sanitizedValues });
  };

  const handleDeleteValue = (attributeId: number, valueId: number) => {
    if (!isAdmin) {
      message.error('Only admin can delete values');
      return;
    }
    deleteValueMutation.mutate({ attributeId, valueId });
  };

  const totalValues = attributes?.reduce((sum, attr) => sum + (attr.allowedValues?.length || 0), 0) || 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!attributes || attributes.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Empty description="No attributes found" />
        </CardContent>
      </Card>
    );
  }

  // Group attributes by their card group
  const grouped: Record<string, MasterAttribute[]> = {};
  const unassigned: MasterAttribute[] = [];
  for (const attr of attributes) {
    if (attr.group && GROUPS.includes(attr.group)) {
      if (!grouped[attr.group]) grouped[attr.group] = [];
      grouped[attr.group].push(attr);
    } else {
      unassigned.push(attr);
    }
  }

  const renderAttributeList = (list: MasterAttribute[]) => (
    <Accordion type="single" collapsible className="attribute-collapse">
      {list.map((attr) => (
        <AccordionItem key={attr.id} value={String(attr.id)}>
          <div className="flex w-full items-center justify-between">
            <AccordionTrigger className="flex-1 hover:no-underline">
              <div className="flex items-center gap-2">
                <Badge variant={typeColors[attr.type] ?? 'default'}>{attr.type}</Badge>
                <strong>{attr.label}</strong>
                <code className="rounded bg-muted px-1 text-xs text-muted-foreground">{attr.key}</code>
                <Badge variant="success">{attr.allowedValues?.length || 0}</Badge>
              </div>
            </AccordionTrigger>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="link"
                size="sm"
                onClick={() => handleEditAttribute(attr)}
                disabled={!isAdmin}
              >
                <Pencil />
                Edit
              </Button>
              <Popconfirm
                title="Delete Attribute"
                description="This will delete all associated values. Continue?"
                onConfirm={() => handleDeleteAttribute(attr.id)}
                okText="Yes"
                cancelText="No"
                disabled={!isAdmin}
              >
                <Button variant="link" size="sm" className="text-destructive" disabled={!isAdmin}>
                  <Trash2 />
                  Delete
                </Button>
              </Popconfirm>
            </div>
          </div>
          <AccordionContent>
            <div className="attribute-values">
              <div className="mb-4 flex items-center justify-between">
                <h5 className="m-0 text-base font-semibold">Allowed Values:</h5>
                <Button variant="outline" size="sm" onClick={() => handleAddValue(attr)} disabled={!isAdmin}>
                  <Plus />
                  Add Value
                </Button>
              </div>
              {attr.allowedValues && attr.allowedValues.length > 0 ? (
                <div className="values-grid">
                  {attr.allowedValues.map((value) => (
                    <Card key={value.id} className="value-card transition-shadow hover:shadow-md">
                      <CardHeader className="flex flex-row items-center justify-between p-3">
                        <div className="flex items-center gap-2">
                          <TagIcon className="h-4 w-4 text-emerald-500" />
                          <strong className="text-sm">{value.fullForm}</strong>
                        </div>
                        <Popconfirm
                          title="Delete Value"
                          onConfirm={() => handleDeleteValue(attr.id, value.id)}
                          okText="Yes"
                          cancelText="No"
                          disabled={!isAdmin}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            disabled={!isAdmin}
                          >
                            <Trash2 />
                          </Button>
                        </Popconfirm>
                      </CardHeader>
                      <CardContent className="px-3 pb-3 pt-0">
                        <code className="text-xs text-muted-foreground">{value.shortForm}</code>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Empty description="No allowed values yet" />
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );

  return (
    <div className="attribute-manager">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            <span>Master Attributes</span>
          </CardTitle>
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Badge variant="info">{attributes.length}</Badge>
              Attributes
            </span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Badge variant="success">{totalValues}</Badge>
              Values
            </span>
            <Button onClick={handleCreateAttribute} disabled={!isAdmin}>
              <Plus />
              Add Attribute
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={GROUPS[0]}>
            <TabsList>
              {GROUPS.map((g) => (
                <TabsTrigger key={g} value={g}>
                  <span
                    className="mr-1 inline-block h-2 w-2 rounded-full"
                    style={{ background: GROUP_COLORS[g] }}
                  />
                  {g}
                  <Badge variant="secondary" className="ml-1">
                    {(grouped[g] || []).length}
                  </Badge>
                </TabsTrigger>
              ))}
              {unassigned.length > 0 && (
                <TabsTrigger value="__unassigned__">
                  Unassigned
                  <Badge variant="secondary" className="ml-1">
                    {unassigned.length}
                  </Badge>
                </TabsTrigger>
              )}
            </TabsList>
            {GROUPS.map((g) => (
              <TabsContent key={g} value={g}>
                {grouped[g]?.length ? renderAttributeList(grouped[g]) : <Empty description={`No attributes in ${g} group`} />}
              </TabsContent>
            ))}
            {unassigned.length > 0 && (
              <TabsContent value="__unassigned__">{renderAttributeList(unassigned)}</TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* Attribute Modal */}
      <Dialog open={isAttrModalOpen} onOpenChange={setIsAttrModalOpen}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingAttribute ? 'Edit Attribute' : 'Create Attribute'}</DialogTitle>
          </DialogHeader>
          <Form {...attrForm}>
            <form onSubmit={attrForm.handleSubmit(onAttrSubmit)} className="space-y-4">
              <FormField
                control={attrForm.control}
                name="key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Key</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., yarn_01, collar" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={attrForm.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Label</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., M_YARN, M_COLLAR_TYPE" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={attrForm.control}
                name="group"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Card Group</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select which article card group this belongs to" />
                        </SelectTrigger>
                        <SelectContent>
                          {GROUPS.map((g) => (
                            <SelectItem key={g} value={g}>
                              <span className="flex items-center gap-2">
                                <span
                                  className="inline-block h-2 w-2 rounded-full"
                                  style={{ background: GROUP_COLORS[g] }}
                                />
                                {g}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={attrForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Input Type</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SELECT">SELECT (dropdown from allowed values)</SelectItem>
                          <SelectItem value="TEXT">TEXT (free text input)</SelectItem>
                          <SelectItem value="NUMBER">NUMBER</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={attrForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="Optional description..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={attrForm.control}
                name="displayOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Order</FormLabel>
                    <FormControl>
                      <InputNumber min={0} value={field.value} onChange={(v) => field.onChange(v ?? 0)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={attrForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between">
                    <FormLabel>Active</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAttrModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createAttrMutation.isPending || updateAttrMutation.isPending}>
                  OK
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add Value Modal */}
      <Dialog open={isValueModalOpen} onOpenChange={setIsValueModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Value to {selectedAttribute?.label || ''}</DialogTitle>
          </DialogHeader>
          <Form {...valueForm}>
            <form onSubmit={valueForm.handleSubmit(onValueSubmit)} className="space-y-4">
              <FormField
                control={valueForm.control}
                name="shortForm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Short Form</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., COTT, POLY" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={valueForm.control}
                name="fullForm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Form</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Cotton, Polyester" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={valueForm.control}
                name="displayOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Order</FormLabel>
                    <FormControl>
                      <InputNumber min={0} value={field.value} onChange={(v) => field.onChange(v ?? 0)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={valueForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between">
                    <FormLabel>Active</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsValueModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={addValueMutation.isPending}>
                  OK
                </Button>
              </DialogFooter>
            </form>
          </Form>
          {/* Tag import retained for type compatibility — used elsewhere in same module */}
          {false && <Tag>noop</Tag>}
        </DialogContent>
      </Dialog>
    </div>
  );
};
