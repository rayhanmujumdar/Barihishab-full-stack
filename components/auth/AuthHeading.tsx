export function AuthHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <p className="kicker">{kicker}</p>
      <h1 className="page-title">{title}</h1>
    </div>
  );
}

export function FormSkeleton() {
  return <div aria-busy="true" style={{ minHeight: 320 }} />;
}
