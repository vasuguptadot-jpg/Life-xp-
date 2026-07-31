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

const loginSchema = z.object({
  email:    z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});
type LoginValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const signinMutation = useSignin();

  const onSubmit = (data: LoginValues) => {
    signinMutation.mutate({ data }, {
      onSuccess: (res) => { setTokens(res.accessToken, res.refreshToken); setLocation("/dashboard"); },
      onError:  (err) => toast({ title: "Sign in failed", description: err.message || "Invalid credentials." }),
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-5 relative overflow-hidden">
      {/* Radial gradient depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(255,255,255,0.04),transparent)] pointer-events-none" />

      <div className="w-full max-w-sm animate-slide-up-fade relative z-10">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center mx-auto mb-5 shadow-[0_0_32px_rgba(255,255,255,0.15)]">
            <Zap className="w-6 h-6 text-black" fill="currentColor" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Welcome back</h1>
          <p className="text-sm text-white/40">Sign in to continue your journey</p>
        </div>

        <div className="glass-md rounded-2xl p-6 elevation-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-white/40">Email</FormLabel>
                  <FormControl>
                    <Input placeholder="you@example.com" {...field} className="bg-white/[0.04] border-white/[0.08] focus-visible:border-white/25 h-11 rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-white/40">Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} className="bg-white/[0.04] border-white/[0.08] focus-visible:border-white/25 h-11 rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full h-11 text-sm font-bold mt-1" disabled={signinMutation.isPending}>
                {signinMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign In"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center mt-5 text-sm text-white/40">
          New here?{" "}
          <Link href="/auth/register" className="text-white font-semibold hover:opacity-70 transition-opacity">Create account</Link>
        </p>
      </div>
    </div>
  );
}
