import { useState } from "react";
import AppLayout from "@/components/layout";
import { useGetMe, useUpdateMe, useLogout } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { clearTokens } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Loader2, LogOut, User as UserIcon, ShieldAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const profileSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(30),
  displayName: z.string().optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

export default function Profile() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useGetMe({ query: { queryKey: ["/api/users/me"] } });
  const updateMutation = useUpdateMe();
  const logoutMutation = useLogout();

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      username: user?.username || "",
      displayName: user?.displayName || "",
    }
  });

  const onSubmit = (data: ProfileValues) => {
    updateMutation.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Profile updated", description: "Changes saved to system." });
        queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      },
      onError: (err) => {
        toast({ title: "Update failed", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleLogout = () => {
    logoutMutation.mutate({ data: { refreshToken: localStorage.getItem("refreshToken") || "" } }, {
      onSettled: () => {
        clearTokens();
        queryClient.clear();
        setLocation("/auth/login");
      }
    });
  };

  if (isLoading) {
    return <AppLayout><div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-8 animate-slide-up-fade">
        <header>
          <h1 className="text-3xl font-bold tracking-tighter text-glow mb-1">Operative Profile</h1>
          <p className="text-muted-foreground font-mono text-sm">Manage identity and system access.</p>
        </header>

        <Card className="border-border bg-card/50 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserIcon className="w-5 h-5 text-primary" />
              Identity Configuration
            </CardTitle>
            <CardDescription>Update your public display information.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Callsign (Username)</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-background/50 font-mono" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Display Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Optional public name" className="bg-background/50 font-mono" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end">
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Save Configuration
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="border-destructive/30 bg-destructive/5 overflow-hidden">
          <div className="h-1 w-full bg-destructive" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-destructive">
              <ShieldAlert className="w-5 h-5" />
              System Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg bg-background/50">
              <div>
                <p className="font-bold text-sm">Terminate Session</p>
                <p className="text-xs text-muted-foreground font-mono">Disconnect this device from the grid.</p>
              </div>
              <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={handleLogout} disabled={logoutMutation.isPending}>
                {logoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><LogOut className="w-4 h-4 mr-2" /> DISCONNECT</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
