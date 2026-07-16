import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Camera, Cpu, ShieldCheck, LogOut, ScanLine, Fingerprint, Eye, ChevronRight } from "lucide-react";

const steps = [
  {
    icon: Camera,
    title: "Upload 6 Photos",
    desc: "Front, sides, back, bottom barcode, and a macro close-up of the POP! logo",
    num: "01",
  },
  {
    icon: Eye,
    title: "AI-assisted observations",
    desc: "The model records visible typography, borders, serials, mold details, and evidence limitations",
    num: "02",
  },
  {
    icon: Fingerprint,
    title: "Assessment Report",
    desc: "A deterministic categorical verdict with observations, limitations, and reference reliability",
    num: "03",
  },
];

const stats = [
  { value: "6", label: "Photo Angles" },
  { value: "7", label: "Result Dimensions" },
  { value: "v1", label: "Decision Engine" },
  { value: "<30s", label: "Analysis Time" },
];

export default function Landing() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto relative z-10">
        <div className="flex items-center gap-2">
          <ScanLine className="w-6 h-6 text-primary" />
          <h2 className="font-display text-xl font-bold tracking-tight">
            Pop<span className="text-primary">Check</span>
          </h2>
        </div>
        <div className="flex gap-3">
          {user ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate("/collection")}>
                Collection
              </Button>
              <Button variant="outline" size="sm" onClick={signOut}>
                <LogOut className="w-4 h-4 mr-1" /> Logout
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => navigate("/auth")}>
              Sign In
            </Button>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex flex-col items-center text-center px-6 pt-20 pb-24 max-w-4xl mx-auto">
        {/* Glow effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="relative z-10"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-sm font-mono mb-8">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            AI-ASSISTED EVIDENCE ASSESSMENT
          </div>

          <h1 className="font-display text-5xl md:text-7xl font-black leading-[0.95] mb-6 tracking-tight">
            Assess your
            <br />
            <span className="text-primary">Funko Pop</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Upload 6 forensic photos and let our AI analyze typography, packaging era, serial codes, and mold details.
            Review visible evidence and limitations before you buy or sell.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Button
              size="lg"
              className="text-lg px-10 py-6 rounded-full font-bold animate-pulse-glow"
              onClick={() => navigate(user ? "/upload" : "/auth")}
            >
              <ScanLine className="w-5 h-5 mr-2" />
              Start Scan
            </Button>
            <span className="text-sm text-muted-foreground">Free • No credit card required</span>
          </div>
        </motion.div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-border/50 bg-card/30">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="flex flex-col items-center py-6 border-r last:border-r-0 border-border/50"
            >
              <span className="font-mono text-2xl font-bold text-primary">{stat.value}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{stat.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-24 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mb-16"
        >
          <span className="text-sm font-mono text-primary uppercase tracking-widest">Process</span>
          <h2 className="font-display text-3xl md:text-4xl font-black mt-3 tracking-tight">How It Works</h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.15 }}
              className="relative group"
            >
              <div className="p-8 rounded-2xl bg-card border border-border/50 hover:border-primary/30 transition-all duration-300 h-full">
                <span className="font-mono text-5xl font-black text-primary/10 absolute top-4 right-6">{step.num}</span>
                <div className="bg-primary/10 text-primary p-3 rounded-xl w-fit mb-5">
                  <step.icon className="w-6 h-6" />
                </div>
                <h3 className="font-display text-lg font-bold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Evidence categories */}
      <section className="px-6 pb-24 max-w-5xl mx-auto">
        <div className="rounded-2xl border border-border/50 bg-card p-8 md:p-12">
          <span className="text-sm font-mono text-primary uppercase tracking-widest">Protocol</span>
          <h2 className="font-display text-2xl md:text-3xl font-black mt-3 mb-8 tracking-tight">
            Visible Evidence Checks
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            {[
              { letter: "V", name: "Vision", desc: "Print texture and halftone dot visibility" },
              { letter: "S", name: "Serial", desc: "Visible production and barcode evidence" },
              { letter: "T", name: "Typography", desc: "Font geometry and POP! logo observations" },
              { letter: "A", name: "Art", desc: "Visible border and artwork alignment" },
              { letter: "M", name: "Mold", desc: "Visible sculpt, paint lines, and finish details" },
              { letter: "P", name: "Packaging", desc: "Box construction and visible era indicators" },
            ].map((item, i) => (
              <motion.div
                key={item.letter}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.08 }}
                className="flex items-center gap-4 p-4 rounded-xl bg-secondary/30 border border-border/30"
              >
                <span className="font-mono text-2xl font-black text-primary w-8">{item.letter}</span>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-24 max-w-3xl mx-auto text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <h2 className="font-display text-3xl md:text-4xl font-black mb-4 tracking-tight">
            Don't get <span className="text-destructive">burned</span>
          </h2>
          <p className="text-muted-foreground mb-8">Review an AI-assisted assessment of the evidence you submit.</p>
          <Button
            size="lg"
            className="text-lg px-10 py-6 rounded-full font-bold"
            onClick={() => navigate(user ? "/upload" : "/auth")}
          >
            Scan Now <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="text-center py-8 text-xs text-muted-foreground border-t border-border/30 font-mono">
        POPCHECK AI - AI-ASSISTED ASSESSMENT
      </footer>
    </div>
  );
}
