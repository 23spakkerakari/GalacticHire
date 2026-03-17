import Link from "next/link";

export default function AccountPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-16">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-semibold">Account</h1>
        <p className="text-slate-300">
          Choose your role-specific account area. This shared route prevents 404s
          when navigation points to a generic account link.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700" href="/candidates/profile">
            Candidate Profile
          </Link>
          <Link className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700" href="/recruiters">
            Recruiter Workspace
          </Link>
          <Link className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700" href="/companies/dashboard">
            Company Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
