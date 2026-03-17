"use client";
import {
  ArrowRight,
  Brain,
  Camera,
  FileSearch,
  MessageCircleMore,
} from "lucide-react";
import { motion } from "framer-motion";
import React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

interface Step {
  step: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}

const HowItWorks = () => {
  const steps: Step[] = [
    {
      step: "01",
      eyebrow: "Capture",
      title: "Upload or Record",
      description:
        "Start from a live session or upload an existing recording without changing your team's hiring workflow.",
      icon: Camera,
      className: "md:col-span-3",
    },
    {
      step: "02",
      eyebrow: "Analyze",
      title: "AI Analysis",
      description:
        "Behavioral patterns, communication quality, and confidence signals are processed automatically in the background.",
      icon: Brain,
      className: "md:col-span-3",
    },
    {
      step: "03",
      eyebrow: "Review",
      title: "Recruiter Insights",
      description:
        "Recruiters get a structured workspace with summaries, side-by-side comparisons, and candidate-level analytics.",
      icon: FileSearch,
      className: "md:col-span-3",
    },
    {
      step: "04",
      eyebrow: "Improve",
      title: "Candidate Feedback",
      description:
        "Candidates receive transparent, actionable feedback that makes practice interviews and real interviews more valuable.",
      icon: MessageCircleMore,
      className: "md:col-span-3",
    },
  ];

  return (
    <section id="how-it-works" className="relative z-10 px-6 py-24">
      <div className="max-w-6xl mx-auto">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/70 backdrop-blur">
            How It Works
          </div>
          <h2 className="mb-4 text-4xl font-semibold tracking-tight text-white md:text-5xl">
            A smooth path from interview capture to candidate intelligence
          </h2>
          <p className="text-lg text-gray-400 md:text-xl">
            The process stays simple for teams, clear for candidates, and
            structured to produce better hiring decisions.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55 }}
            className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.25)] backdrop-blur-xl transition-all duration-300 hover:border-[#F48C06]/30 hover:bg-white/[0.06] md:col-span-6 md:p-8"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,140,6,0.16),transparent_38%)] opacity-80 transition-opacity duration-300 group-hover:opacity-100" />

            <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-4">
                <div className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
                  Workflow Overview
                </div>
                <h3 className="text-3xl font-semibold text-white md:text-4xl">
                  Hiring analysis that feels built in, not bolted on
                </h3>
                <p className="text-base leading-7 text-gray-400">
                  GalacticHire transforms interview recordings into structured
                  intelligence, then routes that intelligence back to recruiters
                  and candidates in a way that is easy to use and easy to trust.
                </p>
              </div>

              <Link href="/learn-more">
                <Button
                  size="lg"
                  variant="outline"
                  className="group/btn rounded-full px-6 uppercase tracking-[0.18em]"
                >
                  Learn More
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                </Button>
              </Link>
            </div>
          </motion.div>

          {steps.map((step, index) => {
            const Icon = step.icon;

            return (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.55, delay: 0.08 + index * 0.08 }}
                className={`group relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.25)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-[#F48C06]/30 hover:bg-white/[0.06] md:p-8 ${step.className}`}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,140,6,0.16),transparent_38%)] opacity-80 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#F48C06]/40 to-transparent opacity-60" />

                <div className="relative z-10 flex h-full flex-col gap-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="rounded-2xl border border-white/10 bg-[#F48C06]/10 p-3 text-[#F48C06]">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="rounded-full border border-[#F48C06]/30 bg-[#F48C06]/10 px-3 py-1 text-xs font-semibold tracking-[0.24em] text-[#F48C06]">
                      {step.step}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs uppercase tracking-[0.24em] text-white/45">
                      {step.eyebrow}
                    </div>
                    <h3 className="text-2xl font-semibold text-white">
                      {step.title}
                    </h3>
                    <p className="text-base leading-7 text-gray-400">
                      {step.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
