import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-16">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-semibold">Page not found</h1>
        <p className="text-slate-300">
          The requested URL does not map to an active route. Use one of these
          known paths to continue.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700" href="/">
            Home
          </Link>
          <Link className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700" href="/candidates">
            Candidates
          </Link>
          <Link className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700" href="/recruiters">
            Recruiters
          </Link>
          <Link className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700" href="/companies/dashboard">
            Companies
          </Link>
        </div>
      </div>
    </main>
  );
}
