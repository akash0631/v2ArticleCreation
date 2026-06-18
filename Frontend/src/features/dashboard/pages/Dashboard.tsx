import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Zap, SlidersHorizontal, Calendar } from 'lucide-react';
import {
  Button,
  Card,
  DataTable,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  type DataTableColumn,
} from '@/shared/components/ui-tw';
import './Dashboard.css';
import { APP_CONFIG } from '../../../constants/app/config';

type FlatDashboardRow = {
  id?: string;
  jobId?: string;
  division?: string | null;
  subDivision?: string | null;
  approvalStatus?: string | null;
  createdAt?: string | null;
};

type AnalyticsSummaryRow = {
  key: string;
  date: string;
  division: string;
  subDivision: string;
  totalExtractions: number;
  totalApproved: number;
};

const normalizeDivisionLabel = (value?: string | null): string => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'MEN') return 'MENS';
  return normalized || 'N/A';
};

const getDashboardTableViewportOffset = (): number => {
  const ratio = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  let offset = 150;
  if (height < 800) offset += 25;
  if (width < 1440) offset += 15;
  if (ratio > 1.25) offset += 20;
  if (ratio > 1.5) offset += 16;
  if (ratio < 1) offset -= 12;
  return offset;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const user = localStorage.getItem('user');
  const userData = user ? JSON.parse(user) : null;
  const isAdmin = userData?.role === 'ADMIN';
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [analyticsRows, setAnalyticsRows] = useState<AnalyticsSummaryRow[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const analyticsTableRef = useRef<HTMLDivElement>(null);
  const [analyticsScrollY, setAnalyticsScrollY] = useState(420);
  const [dateFilter, setDateFilter] = useState<string>('ALL');
  const [divisionFilter, setDivisionFilter] = useState<string>('ALL');
  const [subDivisionFilter, setSubDivisionFilter] = useState<string>('ALL');

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  const recalcAnalyticsScrollY = useCallback(() => {
    const el = analyticsTableRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const viewportOffset = getDashboardTableViewportOffset();
    setAnalyticsScrollY(Math.max(220, window.innerHeight - top - viewportOffset));
  }, []);

  useEffect(() => {
    recalcAnalyticsScrollY();
    window.addEventListener('resize', recalcAnalyticsScrollY);
    return () => window.removeEventListener('resize', recalcAnalyticsScrollY);
  }, [recalcAnalyticsScrollY]);

  useEffect(() => {
    const fetchStats = async () => {
      setAnalyticsLoading(true);
      try {
        const token = localStorage.getItem('authToken');
        const endpoint = `${APP_CONFIG.api.baseURL}/user/extraction/history/flat`;
        const response = await fetch(endpoint, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!response.ok) throw new Error('Failed to fetch extraction history');

        const result = await response.json();
        const jobs: FlatDashboardRow[] = result?.data?.jobs || [];
        const total = jobs.length;
        const today = new Date();
        const todayCountValue = jobs.filter((job) => {
          if (!job.createdAt) return false;
          const createdAt = new Date(job.createdAt);
          return createdAt.toDateString() === today.toDateString();
        }).length;

        const groupedRows = new Map<string, AnalyticsSummaryRow>();

        jobs.forEach((job) => {
          if (!job.createdAt) return;
          const createdAt = new Date(job.createdAt);
          if (Number.isNaN(createdAt.getTime())) return;

          const date = createdAt.toLocaleDateString('en-GB').replace(/\//g, '-');
          const division = normalizeDivisionLabel(job.division);
          const subDivision = String(job.subDivision || 'N/A').trim() || 'N/A';
          const key = `${date}__${division}__${subDivision}`;

          const existing = groupedRows.get(key) || {
            key,
            date,
            division,
            subDivision,
            totalExtractions: 0,
            totalApproved: 0,
          };
          existing.totalExtractions += 1;
          if (String(job.approvalStatus || '').toUpperCase() === 'APPROVED') {
            existing.totalApproved += 1;
          }
          groupedRows.set(key, existing);
        });

        const analyticsData = Array.from(groupedRows.values()).sort((a, b) => {
          const [dayA, monthA, yearA] = a.date.split('-').map(Number);
          const [dayB, monthB, yearB] = b.date.split('-').map(Number);
          const timeA = new Date(yearA, monthA - 1, dayA).getTime();
          const timeB = new Date(yearB, monthB - 1, dayB).getTime();
          if (timeB !== timeA) return timeB - timeA;
          if (a.division !== b.division) return a.division.localeCompare(b.division);
          return a.subDivision.localeCompare(b.subDivision);
        });

        setTotalCount(total);
        setTodayCount(todayCountValue);
        setAnalyticsRows(analyticsData);
        setTimeout(recalcAnalyticsScrollY, 50);
      } catch {
        setTotalCount(0);
        setTodayCount(0);
        setAnalyticsRows([]);
      } finally {
        setAnalyticsLoading(false);
      }
    };

    fetchStats();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'extractionsLastUpdated') fetchStats();
    };
    const handleFocus = () => fetchStats();

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAdmin, recalcAnalyticsScrollY]);

  const analyticsColumns = useMemo<DataTableColumn<AnalyticsSummaryRow>[]>(
    () => [
      { title: 'Date', dataIndex: 'date', key: 'date', width: 130 },
      { title: 'Division', dataIndex: 'division', key: 'division', width: 120 },
      { title: 'Sub Division', dataIndex: 'subDivision', key: 'subDivision', width: 140 },
      { title: 'Total Extractions', dataIndex: 'totalExtractions', key: 'totalExtractions', width: 150 },
      { title: 'Total Approved', dataIndex: 'totalApproved', key: 'totalApproved', width: 140 },
    ],
    [],
  );

  const dateOptions = useMemo(() => {
    return Array.from(new Set(analyticsRows.map((row) => row.date))).sort((a, b) => {
      const [dayA, monthA, yearA] = a.split('-').map(Number);
      const [dayB, monthB, yearB] = b.split('-').map(Number);
      return new Date(yearB, monthB - 1, dayB).getTime() - new Date(yearA, monthA - 1, dayA).getTime();
    });
  }, [analyticsRows]);

  const divisionOptions = useMemo(() => {
    const rows = analyticsRows.filter((row) => dateFilter === 'ALL' || row.date === dateFilter);
    return Array.from(new Set(rows.map((row) => row.division))).sort();
  }, [analyticsRows, dateFilter]);

  const subDivisionOptions = useMemo(() => {
    const rows = analyticsRows.filter((row) => {
      if (dateFilter !== 'ALL' && row.date !== dateFilter) return false;
      if (divisionFilter !== 'ALL' && row.division !== divisionFilter) return false;
      return true;
    });
    return Array.from(new Set(rows.map((row) => row.subDivision))).sort();
  }, [analyticsRows, dateFilter, divisionFilter]);

  const filteredAnalyticsRows = useMemo(() => {
    return analyticsRows.filter((row) => {
      if (dateFilter !== 'ALL' && row.date !== dateFilter) return false;
      if (divisionFilter !== 'ALL' && row.division !== divisionFilter) return false;
      if (subDivisionFilter !== 'ALL' && row.subDivision !== subDivisionFilter) return false;
      return true;
    });
  }, [analyticsRows, dateFilter, divisionFilter, subDivisionFilter]);

  useEffect(() => {
    if (divisionFilter !== 'ALL' && !divisionOptions.includes(divisionFilter)) setDivisionFilter('ALL');
  }, [divisionFilter, divisionOptions]);

  useEffect(() => {
    if (subDivisionFilter !== 'ALL' && !subDivisionOptions.includes(subDivisionFilter)) setSubDivisionFilter('ALL');
  }, [subDivisionFilter, subDivisionOptions]);

  return (
    <div className="flex flex-col gap-3">
      {/* Consolidated hero — one row: greeting + quick stats + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-card px-4 py-3 shadow-[var(--shadow-sm)]">
        <div className="flex min-w-0 items-center gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {greeting}
            </div>
            <h2 className="font-display text-[20px] font-semibold leading-tight tracking-tight text-foreground">
              {userData?.name || 'Welcome back'}
            </h2>
          </div>
          <Separator orientation="vertical" className="hidden h-10 sm:block" />
          <div className="flex items-center gap-4 text-sm">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Today</div>
              <div className="font-display text-lg font-semibold tabular-nums text-foreground">
                {todayCount ?? 0}
                <span className="ml-1 text-xs font-medium text-muted-foreground">
                  {(todayCount ?? 0) === 1 ? 'job' : 'jobs'}
                </span>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</div>
              <div className="font-display text-lg font-semibold tabular-nums text-foreground">
                {totalCount ?? 0}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-9" onClick={() => navigate('/extraction')}>
            <Zap />
            Start Extraction
          </Button>
          <Button size="sm" variant="outline" className="h-9" onClick={() => navigate('/approver')}>
            <ShoppingBag />
            View Products
          </Button>
          {isAdmin && (
            <Button size="sm" variant="outline" className="h-9" onClick={() => navigate('/admin')}>
              <SlidersHorizontal />
              Admin
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        {/* Tight header — title + filters + counts in one row */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <h4 className="font-display text-base font-semibold leading-tight tracking-tight">Analytics Timeline</h4>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span><span className="font-semibold tabular-nums text-foreground">{todayCount ?? 0}</span> today · <span className="font-semibold tabular-nums text-foreground">{totalCount ?? 0}</span> total</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="!h-7 w-[140px] text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Dates</SelectItem>
                {dateOptions.map((date) => (
                  <SelectItem key={date} value={date}>
                    {date}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={divisionFilter}
              onValueChange={(value) => {
                setDivisionFilter(value);
                setSubDivisionFilter('ALL');
              }}
            >
              <SelectTrigger className="!h-7 w-[140px] text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Divisions</SelectItem>
                {divisionOptions.map((division) => (
                  <SelectItem key={division} value={division}>
                    {division}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={subDivisionFilter} onValueChange={setSubDivisionFilter}>
              <SelectTrigger className="!h-7 w-[160px] text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Sub Divisions</SelectItem>
                {subDivisionOptions.map((sd) => (
                  <SelectItem key={sd} value={sd}>
                    {sd}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div ref={analyticsTableRef} className="p-3">
          <DataTable<AnalyticsSummaryRow>
            columns={analyticsColumns}
            dataSource={filteredAnalyticsRows}
            loading={analyticsLoading}
            size="small"
            rowKey="key"
            pagination={{
              pageSize: 50,
              showSizeChanger: true,
              pageSizeOptions: ['25', '50', '100'],
            }}
            scroll={{ x: 'max-content', y: analyticsScrollY }}
            sticky
            locale={{ emptyText: 'No analytics data available yet' }}
            className="dashboard-analytics-table"
          />
        </div>
      </Card>
    </div>
  );
}
