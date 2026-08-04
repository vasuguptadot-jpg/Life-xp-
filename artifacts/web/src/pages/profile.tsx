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
  Loader2, LogOut, Mail, Calendar, Clock, AlertTriangle,
  Camera, Weight, Ruler, Trophy, Zap, Edit3, Plus, Image as ImageIcon,
  Film, Hash, X, Send, Heart, Trash2, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

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

async function uploadFile(file: File): Promise<{ objectPath: string; type: "image" | "video" }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/social/uploads", {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message ?? "Upload failed"); }
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
  if (level < 5)  return "Initiate";
  if (level < 10) return "Adventurer";
  if (level < 20) return "Champion";
  if (level < 35) return "Hero";
  return "Legend";
}

function mediaUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `/api/social/objects${path.replace(/^\/objects/, "")}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

interface UserLevelData { currentLevel: number; totalXp: number; }
interface UserProfileData { avatarUrl: string | null; bio: string | null; age: number | null; weightKg: string | null; heightCm: number | null; }
interface MyPost { id: string; caption: string | null; image_url: string | null; video_url: string | null; hashtags: string[]; likes_count: number; created_at: string; post_type: string; }

// ── Create Post/Clip Modal ───────────────────────────────────────────────────
function CreatePostModal({ postType, onClose, onSuccess }: { postType: "post" | "clip"; onClose: () => void; onSuccess: () => void }) {
  const [caption, setCaption] = useState("");
  const [mediaPath, setMediaPath] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaFileType, setMediaFileType] = useState<"image" | "video" | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const accept = postType === "clip" ? "video/*" : "image/*,video/*";

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/^#/, "");
    if (t && !hashtags.includes(t)) setHashtags(prev => [...prev, t]);
    setTagInput("");
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const preview = URL.createObjectURL(file);
      setMediaPreview(preview);
      const { objectPath, type } = await uploadFile(file);
      setMediaPath(objectPath);
      setMediaFileType(type);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message });
    } finally {
      setUploading(false);
    }
  };

  const createMut = useMutation({
    mutationFn: () => apiFetch("/social/posts", {
      method: "POST",
      body: JSON.stringify({
        caption: caption.trim() || null,
        imageUrl: mediaFileType === "image" ? mediaPath : null,
        videoUrl: mediaFileType === "video" ? mediaPath : null,
        hashtags,
        postType,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/social/posts/mine"] });
      qc.invalidateQueries({ queryKey: ["/api/social/posts"] });
      onSuccess();
      onClose();
    },
    onError: (e: any) => toast({ title: "Post failed", description: e.message }),
  });

  const isClip = postType === "clip";

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="glass-heavy border border-white/[0.1] rounded-2xl w-full max-w-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg flex items-center gap-2">
            {isClip ? <Film className="w-5 h-5 text-purple-400" /> : <ImageIcon className="w-5 h-5 text-blue-400" />}
            {isClip ? "New Clip" : "New Post"}
          </h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <textarea value={caption} onChange={e => setCaption(e.target.value)}
          placeholder={isClip ? "Describe your clip..." : "Share your progress, thoughts, or achievements..."}
          rows={3}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-white/20 transition-colors" />

        {/* Media upload */}
        <div className="space-y-2">
          <input ref={fileRef} type="file" accept={accept} className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {mediaPreview ? (
            <div className="relative rounded-xl overflow-hidden">
              {mediaFileType === "video"
                ? <video src={mediaPreview} className="w-full max-h-56 object-contain bg-black rounded-xl" controls />
                : <img src={mediaPreview} className="w-full rounded-xl max-h-56 object-cover" alt="" />}
              <button onClick={() => { setMediaPath(null); setMediaPreview(null); setMediaFileType(null); }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="w-full h-24 rounded-xl border border-dashed border-white/[0.1] flex flex-col items-center justify-center gap-2 text-white/30 hover:border-white/20 hover:text-white/50 transition-colors">
              {uploading
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <>{isClip ? <Film className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                   <span className="text-xs">{isClip ? "Add video (max 60s)" : "Add photo or video"}</span></>}
            </button>
          )}
        </div>

        {/* Hashtags */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
                placeholder="Add hashtag"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors" />
            </div>
            <button onClick={addTag} className="px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.1] transition-all text-sm font-medium">Add</button>
          </div>
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hashtags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 text-[11px] bg-white/[0.06] border border-white/[0.08] rounded-full px-2.5 py-1">
                  #{t}
                  <button onClick={() => setHashtags(h => h.filter(x => x !== t))} className="text-white/30 hover:text-white/60"><X className="w-2.5 h-2.5" /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        <Button onClick={() => createMut.mutate()} disabled={(!caption.trim() && !mediaPath) || createMut.isPending || uploading} className="w-full">
          {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
          Share {isClip ? "Clip" : "Post"}
        </Button>
      </div>
    </div>
  );
}

// ── Main Profile Page ────────────────────────────────────────────────────────
export default function Profile() {
  const [, setLocation]   = useLocation();
  const { toast }         = useToast();
  const queryClient       = useQueryClient();
  const fileRef           = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [confirmDelete,   setConfirmDelete]   = useState(false);
  const [deleteInput,     setDeleteInput]     = useState("");
  const [createModal, setCreateModal] = useState<null | "post" | "clip">(null);

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
  const { data: myPosts = [], refetch: refetchPosts } = useQuery<MyPost[]>({
    queryKey: ["/api/social/posts/mine"],
    queryFn: () => apiFetch<MyPost[]>("/social/posts/mine"),
    enabled: !!user,
  });

  const updateMutation = useUpdateMe();
  const logoutMutation = useLogout();
  const deleteMutation = useDeleteMe();

  const profileUpdateMut = useMutation({
    mutationFn: (data: Partial<ProfileValues>) => apiFetch("/users/me/profile-extra", { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { refetchProfile(); },
  });

  const deletePostMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/social/posts/${id}`, { method: "DELETE" }),
    onSuccess: () => refetchPosts(),
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
      const { objectPath } = await uploadFile(file);
      await apiFetch("/users/me/profile-extra", { method: "PATCH", body: JSON.stringify({ avatarUrl: objectPath }) });
      refetchProfile();
      toast({ title: "Photo updated!" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message });
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

  const avatarSrc = profileData?.avatarUrl ? mediaUrl(profileData.avatarUrl) : null;

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
              <div className="relative shrink-0">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-2xl font-black overflow-hidden">
                  {avatarSrc
                    ? <img src={avatarSrc} className="w-full h-full object-cover" alt="Avatar" />
                    : user?.username?.charAt(0).toUpperCase() || "U"}
                </div>
                <button onClick={() => fileRef.current?.click()} disabled={uploadingAvatar}
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white flex items-center justify-center border-2 border-black hover:scale-110 transition-transform">
                  {uploadingAvatar ? <Loader2 className="w-3 h-3 text-black animate-spin" /> : <Camera className="w-3 h-3 text-black" />}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
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

        {/* My Content — Post & Clip buttons */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-400/80" /> My Content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <button onClick={() => setCreateModal("post")}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-white/70 hover:text-white transition-all text-sm font-semibold group">
                <div className="w-6 h-6 rounded-lg bg-blue-500/20 border border-blue-400/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                </div>
                New Post
              </button>
              <button onClick={() => setCreateModal("clip")}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-white/70 hover:text-white transition-all text-sm font-semibold group">
                <div className="w-6 h-6 rounded-lg bg-purple-500/20 border border-purple-400/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Film className="w-3.5 h-3.5 text-purple-400" />
                </div>
                New Clip
              </button>
            </div>

            {/* My posts grid */}
            {myPosts.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5 mt-2">
                {myPosts.map(post => {
                  const thumbSrc = mediaUrl(post.image_url) ?? mediaUrl(post.video_url);
                  return (
                    <div key={post.id} className="relative aspect-square rounded-lg overflow-hidden bg-white/[0.04] border border-white/[0.06] group">
                      {thumbSrc ? (
                        post.video_url
                          ? <video src={mediaUrl(post.video_url)!} className="w-full h-full object-cover" />
                          : <img src={thumbSrc} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-white/20" />
                        </div>
                      )}
                      {post.post_type === "clip" && (
                        <div className="absolute top-1.5 left-1.5">
                          <Film className="w-3 h-3 text-white drop-shadow" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                        <span className="text-[10px] text-white/80 flex items-center gap-1"><Heart className="w-3 h-3" />{post.likes_count}</span>
                        <button onClick={() => deletePostMut.mutate(post.id)}
                          className="text-red-400/80 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                      <FormControl><Input {...field} className="bg-white/[0.04] border-white/[0.08] h-9 rounded-xl text-sm" /></FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="displayName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-white/50">Display Name</FormLabel>
                      <FormControl><Input {...field} className="bg-white/[0.04] border-white/[0.08] h-9 rounded-xl text-sm" /></FormControl>
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
                      <FormControl><Input {...field} type="number" placeholder="25" className="bg-white/[0.04] border-white/[0.08] h-9 rounded-xl text-sm" /></FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="weightKg" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-white/50 flex items-center gap-1"><Weight className="w-3 h-3" /> Weight (kg)</FormLabel>
                      <FormControl><Input {...field} type="number" placeholder="70" className="bg-white/[0.04] border-white/[0.08] h-9 rounded-xl text-sm" /></FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="heightCm" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-white/50 flex items-center gap-1"><Ruler className="w-3 h-3" /> Height (cm)</FormLabel>
                      <FormControl><Input {...field} type="number" placeholder="175" className="bg-white/[0.04] border-white/[0.08] h-9 rounded-xl text-sm" /></FormControl>
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

      {/* Sparkles import needed for My Content section */}
      {createModal && (
        <CreatePostModal postType={createModal} onClose={() => setCreateModal(null)} onSuccess={() => {}} />
      )}
    </AppLayout>
  );
}

