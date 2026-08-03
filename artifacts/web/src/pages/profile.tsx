import { useState, useRef } from "react";
import AppLayout from "@/components/layout";
import { useGetMe, useUpdateMe, useLogout, useDeleteMe } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { clearTokens } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as z from "zod";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Loader2, LogOut, User as UserIcon, Mail, Calendar, Clock, AlertTriangle,
  Camera, Weight, Ruler, Trophy, Zap, Edit3
} from "lucide-react";

function getToken() { return localStorage.getItem("accessToken"); }
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message ?? `HTTP ${res.status}`); }
  return res.json();
}

const profileSchema = z.object({
  username:    z.string().min(3).max(30),
  displayName: z.string().optional(),
  bio:         z.string().max(200).optional(),
  age:         z.coerce.number().min(10).max(120).optional().or(z.literal("")),
  weightKg:    z.coerce.number().min(20).max(500).optional().or(z.literal("")),
  heightCm:    z.coerce.number().min(50).max(300).optional().or(z.literal("")),
});
type ProfileValues = z.infer<typeof profileSchema>;

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function rankLabel(level: number) {
  if (level < 5) return "Initiate";
  if (level < 10) return "Adventurer";
  if (level < 20) return "Champion";
  if (level < 35) return "Hero";
  return "Legend";
}

interface UserLevelData { currentLevel: number; totalXp: number; }
interface UserProfileData { avatarUrl: string | null; bio: string | null; age: number | null; weightKg: string | null; heightCm: number | null; }

export default function Profile() {
  const [, setLocation]   = useLocation();
  const { toast }         = useToast();
  const queryClient       = useQueryClient();
  const fileRef           = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [confirmDelete,   setConfirmDelete]   = useState(false);
  const [deleteInput,     setDeleteInput]     = useState("");

  const { data: user, isLoading }  = useGetMe({ query: { queryKey: ["/api/users/me"] } });
  const { data: levelData }        = useQuery<UserLevelData>({
    queryKey: ["/api/users/me/level"],
    queryFn: () => apiFetch<UserLevelData>("/users/me/level"),
    enabled: !!user,
  });
  const { data: profileData, refetch: refetchProfile } = useQuery<UserProfileData>({
    queryKey: ["/api/users/me/profile-extra"],
    queryFn: () => apiFetch<UserProfileData>("/users/me/profile-extra"),
    enabled: !!user,
  });

  const updateMutation = useUpdateMe();
  const logoutMutation = useLogout();
  const deleteMutation = useDeleteMe();

  const profileUpdateMut = useMutation({
    mutationFn: (data: Partial<ProfileValues>) => apiFetch("/users/me/profile-extra", { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { refetchProfile(); },
  });

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      username:    user?.username || "",
      displayName: user?.displayName || "",
      bio:         profileData?.bio || "",
      age:         profileData?.age ?? "",
      weightKg:    profileData?.weightKg ? Number(profileData.weightKg) : "",
      heightCm:    profileData?.heightCm ?? "",
    },
  });

  const onSubmit = async (data: ProfileValues) => {
    const { username, displayName, bio, age, weightKg, heightCm } = data;
    await Promise.all([
      updateMutation.mutateAsync({ data: { username, displayName } }),
      profileUpdateMut.mutateAsync({ bio, age: age || undefined, weightKg: weightKg || undefined, heightCm: heightCm || undefined }),
    ]);
    toast({ title: "Profile saved" });
    queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
  };

  const uploadAvatar = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const urlRes = await fetch("/api/social/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ contentType: file.type }),
      });
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      await apiFetch("/users/me/profile-extra", { method: "PATCH", body: JSON.stringify({ avatarUrl: objectPath }) });
      refetchProfile();
      toast({ title: "Avatar updated!" });
    } catch {
      toast({ title: "Upload failed" });
    } finally {
      setUploadingAvatar(false);
    }
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
      onError: (err) => toast({ title: "Deletion failed", description: err.message }),
    });
  };

  if (isLoading) {
    return <AppLayout><div className="flex justify-center p-16"><Loader2 className="w-8 h-8 animate-spin text-white/30" /></div></AppLayout>;
  }

  const avatarSrc = profileData?.avatarUrl
    ? `/api/social/objects${profileData.avatarUrl.replace(/^\/objects/, "")}`
    : null;

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-4 animate-slide-up-fade">
        <header>
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-0.5">Settings</p>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        </header>

        {/* Hero card with avatar */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-2xl font-black overflow-hidden">
                  {avatarSrc
                    ? <img src={avatarSrc} className="w-full h-full object-cover" alt="Avatar" />
                    : user?.username?.charAt(0).toUpperCase() || "U"}
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white flex items-center justify-center border-2 border-black hover:scale-110 transition-transform"
                >
                  {uploadingAvatar ? <Loader2 className="w-3 h-3 text-black animate-spin" /> : <Camera className="w-3 h-3 text-black" />}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-bold text-lg">{user?.displayName || user?.username}</p>
                <p className="text-xs text-white/40 flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3" />{user?.email}
                </p>
                {levelData && (
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-white/50 flex items-center gap-1">
                      <Trophy className="w-3 h-3 text-yellow-400/70" /> Lv {levelData.currentLevel} · {rankLabel(levelData.currentLevel)}
                    </span>
                    <span className="text-xs text-white/50 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-yellow-400/70" /> {levelData.totalXp.toLocaleString()} XP
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit profile form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Edit3 className="w-4 h-4" /> Edit Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="username" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-white/50">Username</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-white/[0.04] border-white/[0.08] h-9 rounded-xl text-sm" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="displayName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-white/50">Display Name</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-white/[0.04] border-white/[0.08] h-9 rounded-xl text-sm" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="bio" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-white/50">Bio</FormLabel>
                    <FormControl>
                      <textarea {...field} placeholder="Tell the community about yourself..." rows={2}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-white/20 transition-colors" />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )} />

                <div className="grid grid-cols-3 gap-3">
                  <FormField control={form.control} name="age" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-white/50 flex items-center gap-1"><Calendar className="w-3 h-3" /> Age</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="25" className="bg-white/[0.04] border-white/[0.08] h-9 rounded-xl text-sm" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="weightKg" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-white/50 flex items-center gap-1"><Weight className="w-3 h-3" /> Weight (kg)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="70" className="bg-white/[0.04] border-white/[0.08] h-9 rounded-xl text-sm" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="heightCm" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-white/50 flex items-center gap-1"><Ruler className="w-3 h-3" /> Height (cm)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="175" className="bg-white/[0.04] border-white/[0.08] h-9 rounded-xl text-sm" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )} />
                </div>

                <Button type="submit" size="sm" className="w-full" disabled={updateMutation.isPending || profileUpdateMut.isPending}>
                  {(updateMutation.isPending || profileUpdateMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Account info */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-white/30">Account</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-white/40">
                <Calendar className="w-3.5 h-3.5" />
                <span>Member since {fmtDate(user?.createdAt?.toString())}</span>
              </div>
              {user?.lastLoginAt && (
                <div className="flex items-center gap-2 text-white/40">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Last login {fmtDate(user.lastLoginAt.toString())}</span>
                </div>
              )}
            </div>
            <div className="pt-2 flex items-center justify-between">
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
              <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>Delete My Account</Button>
            ) : (
              <div className="space-y-3 p-4 rounded-xl bg-destructive/[0.07] border border-destructive/15">
                <p className="text-xs text-white/60">Type <span className="font-bold text-white">DELETE</span> to confirm.</p>
                <Input value={deleteInput} onChange={e => setDeleteInput(e.target.value)} placeholder="DELETE"
                  className="bg-white/[0.04] border-white/[0.08] focus-visible:border-destructive/50 h-9 rounded-xl font-mono" />
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDelete}
                    disabled={deleteInput !== "DELETE" || deleteMutation.isPending}>
                    {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Permanently Delete"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setConfirmDelete(false); setDeleteInput(""); }}>Cancel</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </AppLayout>
  );
}
