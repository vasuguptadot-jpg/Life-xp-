import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useSignup, useSignin } from "@workspace/api-client-react";
import { setTokens } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import LifeXPLogo from "@/components/lifexp-logo";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const schema = z.object({
  email:    z.string().email("Enter a valid email"),
  username: z.string().min(3, "At least 3 characters").max(30),
  password: z.string().min(8, "At least 8 characters"),
});
type Values = z.infer<typeof schema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", username: "", password: "" } });
  const signupMutation = useSignup();
  const signinMutation = useSignin();
  const isPending = signupMutation.isPending || signinMutation.isPending;

  const onSubmit = (data: Values) => {
    signupMutation.mutate({ data }, {
      onSuccess: () => signinMutation.mutate(
        { data: { email: data.email, password: data.password } },
        {
          onSuccess: (res) => { setTokens(res.accessToken, res.refreshToken); toast({ title: "Account created" }); setLocation("/onboarding"); },
          onError: () => setLocation("/auth/login"),
        }
      ),
      onError: (err) => toast({ title: "Registration failed", description: err.message }),
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-5 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(255,255,255,0.04),transparent)] pointer-events-none" />

      <div className="w-full max-w-sm animate-slide-up-fade relative z-10">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mx-auto mb-5">
            <LifeXPLogo size={52} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Create account</h1>
          <p className="text-sm text-white/40">Track your real-world progress</p>
        </div>

        <div className="glass-md rounded-2xl p-6 elevation-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {(["email", "username", "password"] as const).map(name => (
                <FormField key={name} control={form.control} name={name} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-white/40">
                      {name.charAt(0).toUpperCase() + name.slice(1)}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type={name === "password" ? "password" : "text"}
                        placeholder={name === "email" ? "you@example.com" : name === "username" ? "player_one" : "••••••••"}
                        {...field}
                        className="bg-white/[0.04] border-white/[0.08] focus-visible:border-white/25 h-11 rounded-xl"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              ))}
              <Button type="submit" className="w-full h-11 text-sm font-bold mt-1" disabled={isPending}>
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Get Started"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center mt-5 text-sm text-white/40">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-white font-semibold hover:opacity-70 transition-opacity">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
