import Link from "next/link";

export default function LearnMorePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-16">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-semibold">How GalacticHire Works</h1>
        <p className="text-slate-300">
          GalacticHire helps teams run structured interviews and gives candidates
          actionable feedback from AI-assisted analysis.
        </p>
        <ul className="list-disc space-y-2 pl-6 text-slate-300">
          <li>Capture interview recordings or run sample flows.</li>
          <li>Analyze answers and behavioral indicators.</li>
          <li>Review insights in role-specific dashboards.</li>
        </ul>
        <div className="flex flex-wrap gap-3">
          <Link className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700" href="/recruiters">
            Explore Recruiter Tools
          </Link>
          <Link className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700" href="/candidates">
            Try Candidate Experience
          </Link>
        </div>
      </div>
    </main>
  );
}
