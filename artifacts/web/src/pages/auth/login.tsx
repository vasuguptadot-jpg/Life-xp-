import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useSignin } from "@workspace/api-client-react";
import { setTokens } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

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

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const signinMutation = useSignin();

  const onSubmit = (data: LoginFormValues) => {
    signinMutation.mutate(
      { data },
      {
        onSuccess: (res) => {
          setTokens(res.accessToken, res.refreshToken);
          toast({
            title: "Access granted",
            description: "Welcome back to the grid.",
          });
          setLocation("/dashboard");
        },
        onError: (err) => {
          toast({
            title: "Access denied",
            description: err.message || "Invalid credentials.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Abstract background elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent/5 rounded-full blur-[80px] pointer-events-none" />

      <div className="w-full max-w-md animate-slide-up-fade relative z-10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/50 text-primary font-bold text-2xl mx-auto mb-6 shadow-[0_0_30px_hsl(var(--primary)/0.3)]">
            LX
          </div>
          <h1 className="text-3xl font-bold tracking-tighter text-glow mb-2">Initialize Session</h1>
          <p className="text-muted-foreground text-sm font-mono">Authenticate to sync your real-world progress.</p>
        </div>

        <div className="bg-card/50 backdrop-blur-xl border border-card-border p-8 rounded-xl shadow-2xl">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Signal Address (Email)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="player@example.com" 
                        {...field} 
                        className="bg-background/50 border-card-border focus-visible:border-primary font-mono text-sm"
                      />
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
                    <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Passphrase</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="••••••••" 
                        {...field} 
                        className="bg-background/50 border-card-border focus-visible:border-primary font-mono text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <Button 
                type="submit" 
                className="w-full h-12 text-sm font-bold tracking-widest uppercase mt-4" 
                disabled={signinMutation.isPending}
              >
                {signinMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Establish Connection"
                )}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center mt-8 text-sm text-muted-foreground font-mono">
          New to the system?{" "}
          <Link href="/auth/register" className="text-primary hover:text-primary/80 underline underline-offset-4">
            Register Character
          </Link>
        </p>
      </div>
    </div>
  );
}
