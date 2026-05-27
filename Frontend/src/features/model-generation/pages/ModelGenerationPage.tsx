import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Upload as UploadIcon, Zap, Download, Trash2, Camera, Inbox } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Input,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Spinner,
  Tag,
  Textarea,
} from '@/shared/components/ui-tw';
import { cn } from '@/lib/utils';
import { message } from '@/lib/message';

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api');
const SERVER_BASE = API_BASE.replace(/\/api$/, '');

interface GeneratedImage {
  file: string;
  view: string;
  url: string;
}

const GENDER_OPTIONS = [
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
  { label: 'Kid Boy', value: 'kid boy' },
  { label: 'Kid Girl', value: 'kid girl' },
];

const BODYTYPE_OPTIONS = [
  { label: 'Full Body', value: 'Full-Body' },
  { label: 'Upper Body', value: 'Upper-Body' },
  { label: 'Lower Body', value: 'Lower-Body' },
];

const BROACH_PLACEMENT_OPTIONS = [
  { label: 'Left Chest', value: 'left chest' },
  { label: 'Right Chest', value: 'right chest' },
  { label: 'Center', value: 'center' },
  { label: 'Collar', value: 'collar' },
];

const VIEW_LABELS: Record<string, string> = {
  front: 'Front',
  back: 'Back',
  'left side': 'Left Side',
  closeup: 'Closeup',
};

interface FormValues {
  gender: string;
  bodytype: string;
  imagesCount: string;
  broach_placement?: string;
  color_name?: string;
  special_instructions?: string;
}

export default function ModelGenerationPage() {
  const form = useForm<FormValues>({
    defaultValues: {
      gender: 'female',
      bodytype: 'Full-Body',
      imagesCount: '1',
      broach_placement: '',
      color_name: '',
      special_instructions: '',
    },
  });

  const [designFiles, setDesignFiles] = useState<File[]>([]);
  const [patternFile, setPatternFile] = useState<File | null>(null);
  const [broachFile, setBroachFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const designInputRef = useRef<HTMLInputElement>(null);
  const patternInputRef = useRef<HTMLInputElement>(null);
  const broachInputRef = useRef<HTMLInputElement>(null);

  const startFakeProgress = () => {
    setProgress(0);
    let p = 0;
    progressTimerRef.current = setInterval(() => {
      p += Math.random() * 4;
      if (p >= 90) {
        clearInterval(progressTimerRef.current!);
        p = 90;
      }
      setProgress(Math.round(p));
    }, 800);
  };

  const stopFakeProgress = () => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setProgress(100);
    setTimeout(() => setProgress(0), 800);
  };

  const handleGenerate = async (values: FormValues) => {
    if (!designFiles.length) {
      message.error('Please upload at least one garment image.');
      return;
    }

    setError(null);
    setResults([]);
    setLoading(true);
    startFakeProgress();

    try {
      const formData = new FormData();
      designFiles.forEach((f) => formData.append('designs', f));
      if (patternFile) formData.append('pattern', patternFile);
      if (broachFile) formData.append('broach', broachFile);
      formData.append('gender', values.gender);
      formData.append('bodytype', values.bodytype);
      formData.append('imagesCount', values.imagesCount);
      if (values.broach_placement) formData.append('broach_placement', values.broach_placement);
      if (values.special_instructions) formData.append('special_instructions', values.special_instructions);
      if (values.color_name) formData.append('color_name', values.color_name);

      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_BASE}/model-generation/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Generation failed');

      setResults(data.results);
      message.success(`${data.count} image${data.count !== 1 ? 's' : ''} generated successfully!`);
    } catch (err: any) {
      setError(err.message || 'Generation failed. Please try again.');
    } finally {
      setLoading(false);
      stopFakeProgress();
    }
  };

  const downloadImage = async (url: string, filename: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    } catch {
      message.error('Download failed');
    }
  };

  const downloadAll = async () => {
    for (const img of results) {
      const filename = `${img.file.split('.')[0]}_${img.view.replace(/\s+/g, '_')}.png`;
      await downloadImage(`${SERVER_BASE}${img.url}`, filename);
    }
  };

  const handleDesignDrop = (files: FileList | null) => {
    if (!files) return;
    setDesignFiles((prev) => [...prev, ...Array.from(files)]);
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      <div className="mb-6">
        <h1 className="m-0 flex items-center gap-2.5 text-2xl font-semibold">
          <Camera className="h-6 w-6 text-sky-500" />
          AI Model Generation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload garment images and generate professional fashion model photos using AI.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[9fr_15fr]">
        {/* LEFT — Config Panel */}
        <Card className="sticky top-20 self-start">
          <CardHeader>
            <CardTitle className="text-base">Generation Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleGenerate)} className="flex flex-col gap-4">
                {/* Garment Images */}
                <FormItem>
                  <FormLabel>Garment Images *</FormLabel>
                  <div
                    onDragEnter={() => setIsDragging(true)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      handleDesignDrop(e.dataTransfer.files);
                    }}
                    onClick={() => designInputRef.current?.click()}
                    className={cn(
                      'cursor-pointer rounded-md border-2 border-dashed py-3 text-center transition-colors',
                      isDragging ? 'border-sky-500 bg-sky-50' : 'border-border bg-muted/30 hover:bg-muted/50',
                    )}
                  >
                    <Inbox className="mx-auto my-2 h-7 w-7 text-sky-500" />
                    <p className="text-[13px]">Click or drag garment images here</p>
                  </div>
                  <input
                    ref={designInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleDesignDrop(e.target.files)}
                  />
                  {designFiles.length > 0 && (
                    <div className="mt-2">
                      {designFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between border-b border-border py-1">
                          <span className="truncate text-xs" title={f.name}>
                            {f.name}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => setDesignFiles((prev) => prev.filter((_, j) => j !== i))}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </FormItem>

                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <FormControl>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {GENDER_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bodytype"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Body Type</FormLabel>
                      <FormControl>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BODYTYPE_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="imagesCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Views</FormLabel>
                      <FormControl>
                        <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="imagesCount"
                              value="1"
                              checked={field.value === '1'}
                              onChange={() => field.onChange('1')}
                            />
                            <span className="text-sm">Single (Front only)</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="imagesCount"
                              value="4"
                              checked={field.value === '4'}
                              onChange={() => field.onChange('4')}
                            />
                            <span className="text-sm">All Views (Front / Back / Side / Closeup)</span>
                          </label>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <Separator>Optional</Separator>

                <FormItem>
                  <FormLabel>Pattern Image</FormLabel>
                  <div className="flex items-center gap-2">
                    <input
                      ref={patternInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setPatternFile(e.target.files?.[0] || null)}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => patternInputRef.current?.click()}>
                      <UploadIcon />
                      {patternFile ? patternFile.name : 'Upload Pattern'}
                    </Button>
                    {patternFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setPatternFile(null)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </FormItem>

                <FormItem>
                  <FormLabel>Accessory / Broach Image</FormLabel>
                  <div className="flex items-center gap-2">
                    <input
                      ref={broachInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setBroachFile(e.target.files?.[0] || null)}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => broachInputRef.current?.click()}>
                      <UploadIcon />
                      {broachFile ? broachFile.name : 'Upload Accessory'}
                    </Button>
                    {broachFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setBroachFile(null)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </FormItem>

                <FormField
                  control={form.control}
                  name="broach_placement"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Broach Placement</FormLabel>
                      <FormControl>
                        <Select value={field.value || ''} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="e.g. left chest" />
                          </SelectTrigger>
                          <SelectContent>
                            {BROACH_PLACEMENT_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="color_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color Name (optional lock)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Navy Blue" {...field} value={field.value ?? ''} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="special_instructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Special Instructions</FormLabel>
                      <FormControl>
                        <Textarea rows={2} placeholder="Any specific requirements..." {...field} value={field.value ?? ''} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <Button type="submit" size="lg" className="w-full" disabled={loading || !designFiles.length}>
                  <Zap />
                  {loading ? 'Generating...' : 'Generate Models'}
                </Button>

                {loading && progress > 0 && (
                  <Progress
                    value={progress}
                    indicatorClassName="bg-gradient-to-r from-sky-500 to-emerald-500"
                    className="mt-3"
                  />
                )}
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* RIGHT — Results Panel */}
        <div>
          {error && (
            <Alert type="error" showIcon className="mb-4">
              <div className="flex items-start justify-between gap-2">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="text-muted-foreground">
                  ✕
                </button>
              </div>
            </Alert>
          )}

          {loading && (
            <div className="py-16 text-center">
              <Spinner size="lg" />
              <p className="mt-4 text-sm text-muted-foreground">
                AI is generating your fashion models. This may take 30–90 seconds...
              </p>
            </div>
          )}

          {!loading && results.length === 0 && !error && (
            <Card className="flex min-h-[400px] items-center justify-center">
              <CardContent className="pt-6">
                <Empty
                  description={
                    <span className="text-muted-foreground">
                      Upload garment images and click <strong>Generate Models</strong> to get started.
                    </span>
                  }
                />
              </CardContent>
            </Card>
          )}

          {!loading && results.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">
                  {results.length} Generated Image{results.length !== 1 ? 's' : ''}
                </CardTitle>
                <Button size="sm" variant="outline" onClick={downloadAll}>
                  <Download />
                  Download All
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                  {results.map((img, i) => (
                    <Card key={i} className="overflow-hidden transition-shadow hover:shadow-md">
                      <img
                        src={`${SERVER_BASE}${img.url}`}
                        alt={`${img.file} - ${img.view}`}
                        className="aspect-[2/3] w-full object-cover"
                      />
                      <CardContent className="px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <Tag className="bg-sky-50 text-[11px] text-sky-700">{VIEW_LABELS[img.view] || img.view}</Tag>
                          <span className="truncate text-[11px] text-muted-foreground" title={img.file}>
                            {img.file}
                          </span>
                        </div>
                      </CardContent>
                      <div className="border-t border-border px-3 py-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() =>
                            downloadImage(
                              `${SERVER_BASE}${img.url}`,
                              `${img.file.split('.')[0]}_${img.view.replace(/\s+/g, '_')}.png`,
                            )
                          }
                        >
                          <Download />
                          Download
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
