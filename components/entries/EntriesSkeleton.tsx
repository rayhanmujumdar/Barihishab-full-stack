// S3 loading state: six skeleton rows (Income & Expenses PRD §6.1).
export function EntriesSkeleton({ label }: { label: string }) {
  return (
    <div className="page-stack" aria-busy="true" aria-label={label}>
      <div>
        <div className="skeleton h-3 w-24" />
        <div className="skeleton mt-3 h-10 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 border-t-2 border-foreground">
        <div className="skeleton m-3 h-12" />
        <div className="skeleton m-3 h-12" />
      </div>
      <ul className="m-0 list-none p-0">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="list-row">
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-5 w-20" />
          </li>
        ))}
      </ul>
    </div>
  );
}
