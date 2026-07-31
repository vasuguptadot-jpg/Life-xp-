import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useSignin } from "@workspace/api-client-react";
import { setTokens } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";

/* ── Particle field ─────────────────────────────────────────────────────── */
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    type Particle = {
      x: number; y: number;
      vx: number; vy: number;
      r: number; o: number; pulse: number; phase: number;
    };

    const particles: Particle[] = [];

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 160; i++) {
      particles.push({
        x:     Math.random() * window.innerWidth,
        y:     Math.random() * window.innerHeight,
        vx:    (Math.random() - 0.5) * 0.18,
        vy:    (Math.random() - 0.5) * 0.18,
        r:     Math.random() * 1.4 + 0.3,
        o:     Math.random() * 0.45 + 0.06,
        pulse: Math.random() * 0.012 + 0.004,
        phase: Math.random() * Math.PI * 2,
      });
    }

    let t = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 1;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0)              p.x += canvas.width;
        if (p.x > canvas.width)   p.x -= canvas.width;
        if (p.y < 0)              p.y += canvas.height;
        if (p.y > canvas.height)  p.y -= canvas.height;

        const opacity = p.o * (0.6 + 0.4 * Math.sin(t * p.pulse + p.phase));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${opacity})`;
        ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}

/* ── Schema ─────────────────────────────────────────────────────────────── */
const loginSchema = z.object({
  email:    z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});
type LoginValues = z.infer<typeof loginSchema>;

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function Login() {
  const [, setLocation] = useLocation();
  const { toast }       = useToast();
  const queryClient     = useQueryClient();

  const form = useForm<LoginValues>({
    resolver:      zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signinMutation = useSignin();

  const onSubmit = (data: LoginValues) => {
    signinMutation.mutate({ data }, {
      onSuccess: (res) => {
        setTokens(res.accessToken, res.refreshToken);
        queryClient.removeQueries({ queryKey: ["/api/users/me"] });
        setLocation("/dashboard");
      },
      onError: (err) => toast({
        title:       "Sign in failed",
        description: err.message || "Invalid credentials.",
      }),
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#030305] relative overflow-hidden">

      {/* Particle field */}
      <ParticleField />

      {/* Atmospheric glow orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,1) 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 left-0 w-[400px] h-[400px] -translate-x-1/2 translate-y-1/2 rounded-full opacity-[0.04]"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,1) 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 right-0 w-[400px] h-[400px] translate-x-1/2 translate-y-1/2 rounded-full opacity-[0.04]"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,1) 0%, transparent 70%)" }}
        />
      </div>

      {/* Horizontal scan line */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent pointer-events-none" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-[400px] px-5 animate-slide-up-fade">

        {/* Logo mark */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative mb-6">
            {/* Outer glow ring */}
            <div className="absolute inset-0 rounded-[22px] blur-xl opacity-30 bg-white scale-125" />
            {/* Halo ring */}
            <div
              className="absolute -inset-[5px] rounded-[26px] opacity-20"
              style={{ border: "1px solid rgba(255,255,255,0.6)" }}
            />
            <div
              className="relative w-[56px] h-[56px] rounded-[18px] flex items-center justify-center"
              style={{
                background:  "linear-gradient(135deg, #ffffff 0%, #d4d4d4 100%)",
                boxShadow:   "0 0 32px rgba(255,255,255,0.2), 0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.9)",
              }}
            >
              <Zap className="w-[26px] h-[26px] text-black" fill="currentColor" />
            </div>
          </div>

          <h1
            className="text-[28px] font-bold tracking-tight mb-2"
            style={{ textShadow: "0 0 40px rgba(255,255,255,0.2)" }}
          >
            Welcome back
          </h1>
          <p className="text-[13px] text-white/35 tracking-wide">
            Continue your journey
          </p>
        </div>

        {/* Glass card */}
        <div
          className="relative rounded-3xl overflow-hidden"
          style={{
            background:           "rgba(255,255,255,0.042)",
            backdropFilter:       "blur(60px) saturate(180%)",
            WebkitBackdropFilter: "blur(60px) saturate(180%)",
            border:               "1px solid rgba(255,255,255,0.10)",
            boxShadow: [
              "0 32px 64px rgba(0,0,0,0.8)",
              "0 8px 24px rgba(0,0,0,0.6)",
              "inset 0 1px 0 rgba(255,255,255,0.13)",
              "inset 0 -1px 0 rgba(255,255,255,0.03)",
              "inset 1px 0 0 rgba(255,255,255,0.04)",
              "inset -1px 0 0 rgba(255,255,255,0.04)",
            ].join(","),
          }}
        >
          {/* Top shimmer line */}
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          {/* Inner corner highlights */}
          <div className="absolute top-0 left-0 w-24 h-24 rounded-tl-3xl opacity-[0.03]"
               style={{ background: "radial-gradient(circle at 0% 0%, white, transparent)" }} />
          <div className="absolute top-0 right-0 w-24 h-24 rounded-tr-3xl opacity-[0.03]"
               style={{ background: "radial-gradient(circle at 100% 0%, white, transparent)" }} />

          <div className="p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">
                      Email address
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="you@example.com"
                        {...field}
                        className="h-12 rounded-xl text-sm px-4 placeholder:text-white/20 focus-visible:ring-0 focus-visible:ring-offset-0 transition-all duration-200"
                        style={{
                          background:           "rgba(255,255,255,0.048)",
                          border:               "1px solid rgba(255,255,255,0.09)",
                          backdropFilter:       "blur(8px)",
                          WebkitBackdropFilter: "blur(8px)",
                          color:                "rgba(255,255,255,0.92)",
                          boxShadow:            "inset 0 1px 0 rgba(255,255,255,0.04)",
                        }}
                        onFocus={e => {
                          e.currentTarget.style.border = "1px solid rgba(255,255,255,0.22)";
                          e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                        }}
                        onBlur={e => {
                          e.currentTarget.style.border = "1px solid rgba(255,255,255,0.09)";
                          e.currentTarget.style.background = "rgba(255,255,255,0.048)";
                        }}
                      />
                    </FormControl>
                    <FormMessage className="text-xs text-red-400/80" />
                  </FormItem>
                )} />

                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">
                      Password
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...field}
                        className="h-12 rounded-xl text-sm px-4 placeholder:text-white/20 focus-visible:ring-0 focus-visible:ring-offset-0 transition-all duration-200"
                        style={{
                          background:           "rgba(255,255,255,0.048)",
                          border:               "1px solid rgba(255,255,255,0.09)",
                          backdropFilter:       "blur(8px)",
                          WebkitBackdropFilter: "blur(8px)",
                          color:                "rgba(255,255,255,0.92)",
                          boxShadow:            "inset 0 1px 0 rgba(255,255,255,0.04)",
                        }}
                        onFocus={e => {
                          e.currentTarget.style.border = "1px solid rgba(255,255,255,0.22)";
                          e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                        }}
                        onBlur={e => {
                          e.currentTarget.style.border = "1px solid rgba(255,255,255,0.09)";
                          e.currentTarget.style.background = "rgba(255,255,255,0.048)";
                        }}
                      />
                    </FormControl>
                    <FormMessage className="text-xs text-red-400/80" />
                  </FormItem>
                )} />

                <div className="pt-1">
                  <Button
                    type="submit"
                    className="w-full h-12 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all duration-200 group"
                    style={{
                      background:  "linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(220,220,220,0.92) 100%)",
                      color:       "#080808",
                      border:      "none",
                      boxShadow:   "0 4px 24px rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.8)",
                    }}
                    disabled={signinMutation.isPending}
                  >
                    {signinMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Sign In
                        <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </>
                    )}
                  </Button>
                </div>

              </form>
            </Form>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center mt-6 text-[13px] text-white/30">
          Don't have an account?{" "}
          <Link
            href="/auth/register"
            className="text-white/65 font-semibold hover:text-white/90 transition-colors duration-150 underline underline-offset-2 decoration-white/20 hover:decoration-white/40"
          >
            Create one free
          </Link>
        </p>
      </div>
    </div>
  );
}
