import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useSignin } from "@workspace/api-client-react";
import { setTokens } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";

/* ── Animated floating dots ─────────────────────────────────────────────── */
function FloatingDots() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    type Dot = { x: number; y: number; vx: number; vy: number; r: number; o: number };
    const dots: Dot[] = [];

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 130; i++) {
      dots.push({
        x:  Math.random() * canvas.width,
        y:  Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r:  Math.random() * 1.2 + 0.4,
        o:  Math.random() * 0.35 + 0.08,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0)             d.x += canvas.width;
        if (d.x > canvas.width)  d.x -= canvas.width;
        if (d.y < 0)             d.y += canvas.height;
        if (d.y > canvas.height) d.y -= canvas.height;

        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${d.o})`;
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

/* ── Login schema ────────────────────────────────────────────────────────── */
const loginSchema = z.object({
  email:    z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});
type LoginValues = z.infer<typeof loginSchema>;

/* ── Page ────────────────────────────────────────────────────────────────── */
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
        // Clear any stale auth error so the dashboard layout doesn't
        // immediately see a 401 and bounce the user back here.
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
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">

      {/* ── Animated dots ── */}
      <FloatingDots />

      {/* ── Subtle depth gradients ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_0%,rgba(255,255,255,0.035),transparent)]" />
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-[radial-gradient(ellipse_60%_60%_at_50%_100%,rgba(255,255,255,0.018),transparent)]" />
      </div>

      {/* ── Card ── */}
      <div className="w-full max-w-sm px-5 animate-slide-up-fade relative z-10">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-13 h-13 rounded-2xl bg-white/90 backdrop-blur-sm flex items-center justify-center mx-auto mb-5 shadow-[0_0_40px_rgba(255,255,255,0.18),0_4px_16px_rgba(0,0,0,0.6)]">
            <Zap className="w-6 h-6 text-black" fill="currentColor" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1 text-glow">Welcome back</h1>
          <p className="text-sm text-white/40">Sign in to continue your journey</p>
        </div>

        {/* Liquid glass form card */}
        <div
          className="rounded-2xl p-7 elevation-3"
          style={{
            background:       "rgba(255,255,255,0.055)",
            backdropFilter:   "blur(48px) saturate(200%)",
            WebkitBackdropFilter: "blur(48px) saturate(200%)",
            border:           "1px solid rgba(255,255,255,0.13)",
            boxShadow: [
              "0 8px 40px rgba(0,0,0,0.75)",
              "0 2px 8px rgba(0,0,0,0.6)",
              "inset 0 1px 0 rgba(255,255,255,0.12)",
              "inset 0 -1px 0 rgba(255,255,255,0.03)",
            ].join(","),
          }}
        >
          {/* Inner top-light shimmer */}
          <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
                    Email
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="you@example.com"
                      {...field}
                      className="h-11 rounded-xl text-sm"
                      style={{
                        background:   "rgba(255,255,255,0.05)",
                        border:       "1px solid rgba(255,255,255,0.10)",
                        backdropFilter: "blur(8px)",
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
                    Password
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      {...field}
                      className="h-11 rounded-xl text-sm"
                      style={{
                        background:   "rgba(255,255,255,0.05)",
                        border:       "1px solid rgba(255,255,255,0.10)",
                        backdropFilter: "blur(8px)",
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <Button
                type="submit"
                className="w-full h-11 text-sm font-bold mt-1 rounded-xl transition-all duration-200"
                style={{
                  background: "rgba(255,255,255,0.95)",
                  color:      "#0a0a0a",
                  boxShadow:  "0 2px 16px rgba(255,255,255,0.15), inset 0 1px 0 rgba(255,255,255,0.5)",
                }}
                disabled={signinMutation.isPending}
              >
                {signinMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : "Sign In"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center mt-5 text-sm text-white/35">
          New here?{" "}
          <Link
            href="/auth/register"
            className="text-white/80 font-semibold hover:text-white transition-colors"
          >
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
