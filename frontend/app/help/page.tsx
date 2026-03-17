import Link from "next/link";

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-16">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-semibold">Help & Support</h1>
        <p className="text-slate-300">
          If you are stuck during signup, interview, or dashboard navigation, use
          the links below to return to a valid workspace.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700" href="/">
            Home
          </Link>
          <Link className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700" href="/candidates">
            Candidate Workspace
          </Link>
          <Link className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700" href="/recruiters">
            Recruiter Workspace
          </Link>
        </div>
      </div>
    </main>
  );
}
