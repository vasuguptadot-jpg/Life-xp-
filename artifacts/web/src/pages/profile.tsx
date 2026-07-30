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
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Loader2, LogOut, User as UserIcon, Mail, Shield } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const profileSchema = z.object({
  username:    z.string().min(3).max(30),
  displayName: z.string().optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

export default function Profile() {
  const [, setLocation] = useLocation();
  const { toast }       = useToast();
  const queryClient     = useQueryClient();

  const { data: user, isLoading } = useGetMe({ query: { queryKey: ["/api/users/me"] } });
  const updateMutation = useUpdateMe();
  const logoutMutation = useLogout();

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      username:    user?.username    || "",
      displayName: user?.displayName || "",
    }
  });

  const onSubmit = (data: ProfileValues) => {
    updateMutation.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Profile updated" });
        queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      },
      onError: (err) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
    });
  };

  const handleLogout = () => {
    logoutMutation.mutate(
      { data: { refreshToken: localStorage.getItem("refreshToken") || "" } },
      {
        onSettled: () => {
          clearTokens();
          queryClient.clear();
          setLocation("/auth/login");
        }
      }
    );
  };

  if (isLoading) {
    return <AppLayout><div className="flex justify-center p-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-5 animate-slide-up-fade">

        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Account</p>
          <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        </header>

        {/* Avatar + meta */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center text-2xl font-black text-primary shrink-0">
                {user?.username?.charAt(0).toUpperCase() || "U"}
              </div>
              <div>
                <p className="text-lg font-bold">{user?.displayName || user?.username}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />{user?.email}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Identity form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-accent" />
              Edit Profile
            </CardTitle>
            <CardDescription>Update your display information.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Username</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-surface border-border focus-visible:border-primary h-11 rounded-xl" />
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
                      <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Display Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Optional" className="bg-surface border-border focus-visible:border-primary h-11 rounded-xl" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-1">
                  <Button type="submit" disabled={updateMutation.isPending} size="sm">
                    {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Save Changes
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Danger zone */}
        <Card className="border-destructive/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <Shield className="w-4 h-4" />
              Account Access
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface">
              <div>
                <p className="text-sm font-semibold">Sign out</p>
                <p className="text-xs text-muted-foreground mt-0.5">You'll need to sign back in.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground shrink-0"
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
              >
                {logoutMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <><LogOut className="w-4 h-4 mr-1.5" /> Sign Out</>}
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>
    </AppLayout>
  );
}
