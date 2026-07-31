import { useState } from "react";
import AppLayout from "@/components/layout";
import { useGetMe, useUpdateMe, useLogout, useDeleteMe } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { clearTokens } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, LogOut, User as UserIcon, Mail, Calendar, Clock, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const profileSchema = z.object({
  username:    z.string().min(3).max(30),
  displayName: z.string().optional(),
});
type ProfileValues = z.infer<typeof profileSchema>;

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function Profile() {
  const [, setLocation] = useLocation();
  const { toast }       = useToast();
  const queryClient     = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteInput,   setDeleteInput]   = useState("");

  const { data: user, isLoading } = useGetMe({ query: { queryKey: ["/api/users/me"] } });
  const updateMutation = useUpdateMe();
  const logoutMutation = useLogout();
  const deleteMutation = useDeleteMe();

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: { username: user?.username || "", displayName: user?.displayName || "" },
  });

  const onSubmit = (data: ProfileValues) => {
    updateMutation.mutate({ data }, {
      onSuccess: () => { toast({ title: "Profile saved" }); queryClient.invalidateQueries({ queryKey: ["/api/users/me"] }); },
      onError:  (err) => toast({ title: "Update failed", description: err.message }),
    });
  };

  const handleLogout = () => {
    logoutMutation.mutate({ data: { refreshToken: localStorage.getItem("refreshToken") || "" } }, {
      onSettled: () => { clearTokens(); queryClient.clear(); setLocation("/auth/login"); }
    });
  };

  const handleDelete = () => {
    if (deleteInput !== "DELETE") return;
    deleteMutation.mutate(undefined, {
      onSuccess: () => { clearTokens(); queryClient.clear(); setLocation("/auth/login"); },
      onError:  (err) => toast({ title: "Deletion failed", description: err.message }),
    });
  };

  if (isLoading) {
    return <AppLayout><div className="flex justify-center p-16"><Loader2 className="w-8 h-8 animate-spin text-white/30" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-4 animate-slide-up-fade">
        <header>
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-0.5">Settings</p>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        </header>

        {/* Account meta */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-xl font-black shrink-0">
                {user?.username?.charAt(0).toUpperCase() || "U"}
              </div>
              <div>
                <p className="font-semibold">{user?.displayName || user?.username}</p>
                <p className="text-xs text-white/40 flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3" />{user?.email}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-white/40">
              <div className="flex items-center gap-1.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <Calendar className="w-3 h-3 shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wide mb-0.5">Member since</div>
                  <div className="text-white/70 font-medium">{fmtDate(user?.createdAt)}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <Clock className="w-3 h-3 shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wide mb-0.5">Last login</div>
                  <div className="text-white/70 font-medium">{fmtDate(user?.lastLoginAt)}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-white/60">
              <UserIcon className="w-4 h-4" /> Edit Profile
            </CardTitle>
            <CardDescription>Update your display name and username.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="username" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-white/40">Username</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-white/[0.04] border-white/[0.08] focus-visible:border-white/25 h-10 rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="displayName" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-white/40">Display Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Optional" className="bg-white/[0.04] border-white/[0.08] focus-visible:border-white/25 h-10 rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                    {updateMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />}
                    Save Changes
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Sign out */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Sign Out</p>
                <p className="text-xs text-white/40 mt-0.5">Sign out of this device.</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout} disabled={logoutMutation.isPending}>
                {logoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><LogOut className="w-4 h-4 mr-1.5" />Sign Out</>}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Delete account */}
        <Card className="border-destructive/15">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive/80">
              <AlertTriangle className="w-4 h-4" /> Delete Account
            </CardTitle>
            <CardDescription>This permanently deletes your account and all data. Cannot be undone.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!confirmDelete ? (
              <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
                Delete My Account
              </Button>
            ) : (
              <div className="space-y-3 p-4 rounded-xl bg-destructive/[0.07] border border-destructive/15">
                <p className="text-xs text-white/60">Type <span className="font-bold text-white">DELETE</span> to confirm permanent deletion.</p>
                <Input
                  value={deleteInput}
                  onChange={e => setDeleteInput(e.target.value)}
                  placeholder="DELETE"
                  className="bg-white/[0.04] border-white/[0.08] focus-visible:border-destructive/50 h-9 rounded-xl font-mono"
                />
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDelete}
                    disabled={deleteInput !== "DELETE" || deleteMutation.isPending}>
                    {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Permanently Delete"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setConfirmDelete(false); setDeleteInput(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </AppLayout>
  );
}
