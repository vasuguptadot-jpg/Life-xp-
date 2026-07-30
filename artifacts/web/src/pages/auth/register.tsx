import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useSignup, useSignin } from "@workspace/api-client-react";
import { setTokens } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  username: z.string().min(3, "Username must be at least 3 characters").max(30),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", username: "", password: "" },
  });

  const signupMutation = useSignup();
  const signinMutation = useSignin();

  const onSubmit = (data: RegisterFormValues) => {
    signupMutation.mutate({ data }, {
      onSuccess: () => {
        signinMutation.mutate(
          { data: { email: data.email, password: data.password } },
          {
            onSuccess: (res) => {
              setTokens(res.accessToken, res.refreshToken);
              toast({ title: "Account created", description: "Welcome to LifeXP!" });
              setLocation("/onboarding");
            },
            onError: () => setLocation("/auth/login"),
          }
        );
      },
      onError: (err) => {
        toast({ title: "Registration failed", description: err.message || "Could not create account.", variant: "destructive" });
      },
    });
  };

  const isPending = signupMutation.isPending || signinMutation.isPending;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-5 relative overflow-hidden">
      <div className="absolute top-1/4 -right-32 w-96 h-96 bg-primary/6 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -left-32 w-80 h-80 bg-accent/6 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-sm animate-slide-up-fade relative z-10">

        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-5 shadow-[0_0_32px_hsl(var(--primary)/0.5)]">
            <Zap className="w-7 h-7 text-primary-foreground" fill="currentColor" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Create account</h1>
          <p className="text-sm text-muted-foreground">Start tracking your real-world progress</p>
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</FormLabel>
                    <FormControl>
                      <Input placeholder="you@example.com" {...field} className="bg-surface border-border focus-visible:border-primary h-11 rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Username</FormLabel>
                    <FormControl>
                      <Input placeholder="player_one" {...field} className="bg-surface border-border focus-visible:border-primary h-11 rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} className="bg-surface border-border focus-visible:border-primary h-11 rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full h-12 text-sm font-bold tracking-wide mt-2" disabled={isPending}>
                {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Get Started"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center mt-6 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-primary font-semibold hover:text-primary/80 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
