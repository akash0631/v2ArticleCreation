/**
 * @deprecated Stub — original 526-line antd implementation was deferred
 * during the Tailwind migration merge. Needs a fresh shadcn rewrite before
 * the /admin/srm-failed route becomes useful again. The Sidebar/MainLayout
 * link still routes here; this page currently renders an empty placeholder.
 *
 * Original location/scope: SRM records stuck at SRM_IMPORT status (VLM
 * enrichment never completed), with per-record retry and bulk retry-all.
 */
export default function SrmFailedExtractionsPage() {
  return (
    <div className="p-6">
      <h1 className="mb-2 text-2xl font-semibold">Failed Extractions</h1>
      <p className="text-sm text-muted-foreground">
        This page is being rebuilt. Please ask the team to migrate{' '}
        <code className="rounded bg-muted px-1">SrmFailedExtractionsPage.tsx</code> to the new design system.
      </p>
    </div>
  );
}
