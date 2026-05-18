import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";
import { SearchBar } from "@/components/SearchBar";
import { TLD } from "@/lib/contracts";

/**
 * Cinematic hero — Velorix IIC-inspired.
 * The uploaded ARC arch logo (public/arc-logo.jpg) sits behind everything as a
 * huge low-opacity watermark with very slow parallax drift + soft bloom pulse.
 * Foreground: headline, subcopy, search, CTA.
 *
 * No Three.js. No WebGL. Just CSS + framer-motion — runs on any device.
 */
export function ArcHero() {
  const reduce = useReducedMotion();
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  // Subtle parallax on pointer move (desktop only — disabled if reduced motion)
  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      setMouse({ x, y });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce]);

  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      {/* ── Deep space gradient base ─────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 35%, rgba(30,40,80,0.55), transparent 65%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(99,102,241,0.18), transparent 70%), #000",
        }}
      />

      {/* ── Watermark ARC logo — huge, behind everything ────────────────── */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-0"
        style={{
          x: "-50%",
          y: "-50%",
        }}
        animate={
          reduce
            ? undefined
            : {
                x: `calc(-50% + ${mouse.x * -12}px)`,
                y: `calc(-50% + ${mouse.y * -12}px)`,
              }
        }
        transition={{ type: "spring", stiffness: 30, damping: 20, mass: 1.2 }}
      >
        <motion.img
          src="/arc-logo.jpg"
          alt=""
          draggable={false}
          className="select-none"
          style={{
            width: "min(140vw, 1400px)",
            height: "auto",
            opacity: 0.1,
            filter: "blur(0.5px) saturate(0.6) brightness(1.4)",
            mixBlendMode: "screen",
            maskImage:
              "radial-gradient(ellipse 65% 65% at 50% 50%, black 35%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 65% 65% at 50% 50%, black 35%, transparent 80%)",
          }}
          initial={{ scale: 1, opacity: 0 }}
          animate={
            reduce
              ? { opacity: 0.1, scale: 1 }
              : {
                  opacity: [0.07, 0.12, 0.07],
                  scale: [1, 1.02, 1],
                }
          }
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </motion.div>

      {/* ── Soft bloom under the watermark ──────────────────────────────── */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[60vh] w-[60vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
        style={{
          background:
            "radial-gradient(circle, rgba(99,102,241,0.45) 0%, rgba(168,85,247,0.25) 40%, transparent 70%)",
        }}
        animate={
          reduce
            ? undefined
            : { opacity: [0.6, 0.95, 0.6], scale: [1, 1.08, 1] }
        }
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Top vignette + grain ────────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(0,0,0,0.6), transparent 50%), radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.8), transparent 60%)",
        }}
      />

      {/* ── Foreground content ──────────────────────────────────────────── */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-4 py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/60 backdrop-blur"
        >
          <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
          Live on Arc Testnet
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-4xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
          style={{
            backgroundImage:
              "linear-gradient(180deg, #ffffff 0%, #ffffff 55%, rgba(255,255,255,0.55) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Your wallet,
          <br />
          your name on ARC.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-xl font-mono text-[11px] leading-relaxed text-white/45 sm:text-xs"
        >
          mint a .{TLD} domain — a human name your wallet carries
          <br className="hidden sm:block" />
          across every dApp on Arc Testnet, forever onchain.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 w-full max-w-xl"
        >
          <SearchBar size="lg" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            href="/explore"
            className="group inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition-transform hover:scale-[1.03]"
          >
            Explore domains
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
          <Link
            href="/my-domains"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/80 backdrop-blur transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            My domains
          </Link>
        </motion.div>
      </div>

      {/* ── Bottom fade into the rest of the page ───────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-b from-transparent to-black" />
    </section>
  );
}
