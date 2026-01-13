"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/auth";

type Interview = {
  id: string;
  title: string | null;
  description?: string | null;
  created_at?: string | null;
  scheduled_date?: string | null;
  status?: string | null;
};

export default function RecruiterDashboardPage() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push("/recruiters/login");
      router.refresh();
    } catch (e) {
      console.error("Error during logout:", e);
      setError("Failed to log out. Please try again.");
    }
  };

  useEffect(() => {
    const loadInterviews = async () => {
      try {
        setLoading(true);
        setError(null);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) {
          setError("Unable to load user session.");
          return;
        }
        if (!user) {
          setError("You must be signed in to view this page.");
          return;
        }

        const { data, error } = await supabase
          .from("interview")
          .select("id, title, description, created_at")
          .eq("recruiter_id", user.id)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Failed to load interviews:", error);
          setError("Failed to load interviews.");
          return;
        }
        setInterviews(data || []);
      } finally {
        setLoading(false);
      }
    };

    loadInterviews();
  }, [supabase]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-100">
      {/* Background Animated Blobs (palette from companies dashboard) */}
      <motion.div
        initial={{ opacity: 0.7, x: -150, y: -100 }}
        animate={{ x: [-150, 50, -150], y: [-100, 20, -100] }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        className="absolute w-56 h-56 bg-pink-500 rounded-full mix-blend-multiply filter blur-2xl opacity-70"
      />
      <motion.div
        initial={{ opacity: 0.6, x: 200, y: 50 }}
        animate={{ x: [200, -50, 200], y: [50, -80, 50] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
        className="absolute w-64 h-64 bg-yellow-500 rounded-full mix-blend-multiply filter blur-3xl opacity-70"
      />
      <motion.div
        initial={{ opacity: 0.65, x: -100, y: 300 }}
        animate={{ x: [-100, 100, -100], y: [300, 250, 300] }}
        transition={{ duration: 35, repeat: Infinity, ease: "easeInOut" }}
        className="absolute w-96 h-96 bg-green-400 rounded-full mix-blend-multiply filter blur-3xl opacity-50"
      />

      {/* Subtle grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-60"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.035)_1px,transparent_1px)] bg-[size:24px_24px]" />
      </div>

      {/* Soft vignette and noise overlay */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-white/20 mix-blend-overlay" />
        <div className="absolute inset-0 opacity-[0.04]">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <filter id="noiseFilter">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#noiseFilter)"></rect>
          </svg>
        </div>
      </div>

      {/* Sidebar (simple, matches palette) */}
      <aside className="fixed inset-y-0 left-0 w-64 bg-gradient-to-b from-white to-gray-50/90 border-r border-gray-200/70 shadow-md z-20 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="flex items-center justify-center h-16 border-b">
          <h1 className="text-2xl font-bold text-gray-800">GalacticHire</h1>
        </div>
        <nav className="mt-4">
          <ul>
            <li>
              <Link
                href="/recruiter-dashboard"
                className="block px-4 py-3 text-gray-700 hover:bg-gray-200"
              >
                Dashboard
              </Link>
            </li>
            <li>
              <Link
                href="/recruiters"
                className="block px-4 py-3 text-gray-700 hover:bg-gray-200"
              >
                Recruiter Tools
              </Link>
            </li>
            <li>
              <Link
                href="/account"
                className="block px-4 py-3 text-gray-700 hover:bg-gray-200"
              >
                Account
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full text-left block px-4 py-3 text-gray-700 hover:bg-gray-200"
                aria-label="Log out"
              >
                Log out
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="ml-64 relative z-10 p-6">
        <header className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-gray-800 to-gray-600 tracking-tight">
            Recruiter Dashboard
          </h2>
          <Link href="/recruiter-dashboard" aria-label="HireVision Home" className="block">
            <Image
              src="/logo.png"
              alt="HireVision Logo"
              width={96}
              height={28}
              className="rounded-md opacity-90 hover:opacity-100 transition-opacity"
              priority
            />
          </Link>
        </header>

        <section className="mt-2">
          <h3 className="text-xl font-semibold text-gray-700 mb-1">
            Your Interviews
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Browse and jump back into any interview you’ve created.
          </p>

          {loading ? (
            <div className="bg-white/80 backdrop-blur rounded-xl border border-gray-200 p-6 shadow text-gray-600">
              Loading interviews...
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
              {error}
            </div>
          ) : interviews.length === 0 ? (
            <div className="bg-white/80 backdrop-blur rounded-xl border border-gray-200 p-6 shadow text-gray-600">
              No interviews found. Create one from the Recruiter workspace.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {interviews.map((iv) => {
                const date = iv.created_at || undefined;
                return (
                  <motion.div
                    key={iv.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="group bg-white/80 backdrop-blur-md border border-gray-200/80 rounded-xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 relative overflow-hidden"
                  >
                    {/* subtle corner accent */}
                    <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gradient-to-br from-pink-400/20 via-yellow-400/20 to-green-400/20 blur-2xl" />

                    <h4 className="text-lg font-semibold text-gray-800">
                      {iv.title || "Untitled Interview"}
                    </h4>
                    {date && (
                      <p className="text-sm text-gray-500 mt-1">
                        {new Date(date).toLocaleString()}
                      </p>
                    )}
                    
                    {iv.description && (
                      <p className="text-gray-700 mt-3 line-clamp-3">
                        {iv.description}
                      </p>
                    )}
                    <div className="mt-4 flex gap-3">
                      <Link
                        href={`/recruiters?interview=${iv.id}`}
                        className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm shadow-sm ring-1 ring-blue-500/20 hover:ring-blue-500/40 transition"
                      >
                        Open
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

