"use client";
import {
  BrainCircuit,
  GaugeCircle,
  LayoutDashboard,
  MessageSquareQuote,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import React from "react";

interface Feature {
  eyebrow: string;
  title: string;
  description: string;
  metric: string;
  highlights: string[];
  className: string;
  icon: React.ComponentType<{ className?: string }>;
}

const Features = () => {
  const features: Feature[] = [
    {
      eyebrow: "Signal Layer",
      title: "AI Interview Summary",
      description:
        "Turn raw interview responses into concise recruiter-ready summaries, recommendations, and follow-up prompts.",
      metric: "92% faster review loops",
      highlights: ["Auto summaries", "Role context", "Instant takeaways"],
      className: "md:col-span-4 md:row-span-2",
      icon: BrainCircuit,
    },
    {
      eyebrow: "Behavior Engine",
      title: "Emotion & Confidence Scoring",
      description:
        "Track confidence, pacing, and emotional steadiness across every response instead of relying on gut feel.",
      metric: "Live behavioral signal",
      highlights: ["Confidence shifts", "Emotion markers"],
      className: "md:col-span-2",
      icon: GaugeCircle,
    },
    {
      eyebrow: "Decision Workspace",
      title: "Recruiter Insights Dashboard",
      description:
        "Compare candidates side-by-side with skills, transcript themes, and interview outcomes in one place.",
      metric: "Unified hiring view",
      highlights: ["Cross-candidate compare", "Skill snapshots"],
      className: "md:col-span-2",
      icon: LayoutDashboard,
    },
    {
      eyebrow: "Candidate Experience",
      title: "Real-Time Candidate Feedback",
      description:
        "Give candidates clear, immediate feedback that improves trust and makes repeat practice genuinely useful.",
      metric: "Transparent feedback loop",
      highlights: ["Actionable notes", "Better candidate trust", "Faster iteration"],
      className: "md:col-span-4",
      icon: MessageSquareQuote,
    },
  ];

  return (
    <section
      id="features"
      className="relative z-10 overflow-hidden bg-[#0A0F1A] px-6 py-24"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#F48C06]/10 to-transparent" />

      <div className="max-w-6xl mx-auto">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/70 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-[#F48C06]" />
            Powerful Features
          </div>
          <h2 className="mb-4 text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Built to turn interviews into signal, not noise
          </h2>
          <p className="text-lg text-gray-400 md:text-xl">
            Every feature is designed to help recruiters move faster while
            giving candidates a more transparent experience.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;

            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.55, delay: index * 0.08 }}
                className={`group relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.25)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-[#F48C06]/30 hover:bg-white/[0.06] md:p-8 ${feature.className}`}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,140,6,0.16),transparent_38%)] opacity-80 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#F48C06]/40 to-transparent opacity-60" />

                <div className="relative z-10 flex h-full flex-col justify-between gap-8">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-4">
                      <div className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
                        {feature.eyebrow}
                      </div>
                      <div className="space-y-3">
                        <h3 className="text-2xl font-semibold text-white md:text-3xl">
                          {feature.title}
                        </h3>
                        <p className="max-w-2xl text-base leading-7 text-gray-400">
                          {feature.description}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#F48C06]/10 p-3 text-[#F48C06] shadow-[0_0_30px_rgba(244,140,6,0.08)]">
                      <Icon className="h-6 w-6" />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="mb-2 text-xs uppercase tracking-[0.24em] text-white/45">
                        Impact
                      </div>
                      <div className="text-lg font-semibold text-white">
                        {feature.metric}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {feature.highlights.map((highlight) => (
                        <span
                          key={highlight}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75"
                        >
                          {highlight}
                        </span>
                      ))}
                    </div>
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

export default Features;
