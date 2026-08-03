import { useState, useRef } from "react";
import AppLayout from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Loader2, Heart, MessageCircle, Hash, Plus, X, Image as ImageIcon,
  Zap, Sparkles, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

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
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface Post {
  id: string;
  caption: string | null;
  image_url: string | null;
  hashtags: string[];
  likes_count: number;
  created_at: string;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  liked_by_me: boolean;
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

function PostCard({ post, onLike, onUnlike, onTagClick, onUserClick }: {
  post: Post;
  onLike: (id: string) => void;
  onUnlike: (id: string) => void;
  onTagClick: (tag: string) => void;
  onUserClick: (id: string) => void;
}) {
  const avatarSrc = post.avatar_url
    ? `/api/social/objects${post.avatar_url.replace(/^\/objects/, "")}`
    : null;

  return (
    <article className="glass-heavy border border-white/[0.08] rounded-2xl overflow-hidden">
      {/* User header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <button onClick={() => onUserClick(post.user_id)} className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden hover:opacity-80 transition-opacity">
          {avatarSrc ? <img src={avatarSrc} className="w-full h-full object-cover" /> : (post.display_name || post.username).charAt(0).toUpperCase()}
        </button>
        <div className="flex-1 min-w-0">
          <button onClick={() => onUserClick(post.user_id)} className="text-sm font-semibold hover:text-white/70 transition-colors">
            {post.display_name || post.username}
          </button>
          <p className="text-[10px] text-white/30">@{post.username} · {timeAgo(post.created_at)}</p>
        </div>
      </div>

      {/* Image */}
      {post.image_url && (
        <div className="px-4 pb-3">
          <img
            src={post.image_url.startsWith("/objects") ? `/api/social${post.image_url}` : post.image_url}
            className="w-full rounded-xl object-cover max-h-80"
            alt="Post image"
          />
        </div>
      )}

      {/* Caption */}
      {post.caption && (
        <div className="px-4 pb-3">
          <p className="text-sm leading-relaxed text-white/90">{post.caption}</p>
        </div>
      )}

      {/* Hashtags */}
      {post.hashtags?.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {post.hashtags.map(tag => (
            <button key={tag} onClick={() => onTagClick(tag)}
              className="text-[11px] font-semibold text-white/50 hover:text-white/80 transition-colors bg-white/[0.04] border border-white/[0.06] rounded-full px-2.5 py-1">
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 px-4 py-3 border-t border-white/[0.05]">
        <button
          onClick={() => post.liked_by_me ? onUnlike(post.id) : onLike(post.id)}
          className={cn("flex items-center gap-1.5 text-xs font-semibold transition-colors",
            post.liked_by_me ? "text-red-400" : "text-white/30 hover:text-white/60")}
        >
          <Heart className={cn("w-4 h-4", post.liked_by_me && "fill-current")} />
          {post.likes_count}
        </button>
      </div>
    </article>
  );
}

function CreatePostModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/^#/, "");
    if (t && !hashtags.includes(t)) setHashtags(prev => [...prev, t]);
    setTagInput("");
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const urlRes = await fetch("/api/social/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ contentType: file.type }),
      });
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      setImageUrl(objectPath);
    } catch {
      toast({ title: "Upload failed", description: "Could not upload image" });
    } finally {
      setUploading(false);
    }
  };

  const createMut = useMutation({
    mutationFn: () => apiFetch("/social/posts", {
      method: "POST",
      body: JSON.stringify({ caption: caption.trim() || null, imageUrl: imageUrl || null, hashtags }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/social/posts"] });
      onSuccess();
      onClose();
    },
    onError: (e) => toast({ title: "Post failed", description: e.message }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="glass-heavy border border-white/[0.1] rounded-2xl w-full max-w-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">New Post</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"><X className="w-4 h-4" /></button>
        </div>

        {/* Caption */}
        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="Share your progress, thoughts, or achievements..."
          rows={3}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-white/20 transition-colors"
        />

        {/* Image upload */}
        <div className="space-y-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0])} />
          {imageUrl ? (
            <div className="relative">
              <img src={`/api/social/objects${imageUrl.replace(/^\/objects/, "")}`} className="w-full rounded-xl max-h-48 object-cover" />
              <button onClick={() => setImageUrl("")} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="w-full h-24 rounded-xl border border-dashed border-white/[0.1] flex flex-col items-center justify-center gap-2 text-white/30 hover:border-white/20 hover:text-white/50 transition-colors">
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ImageIcon className="w-5 h-5" /><span className="text-xs">Add image</span></>}
            </button>
          )}
        </div>

        {/* Hashtags */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
                placeholder="Add hashtag"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
              />
            </div>
            <button onClick={addTag} className="px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.1] transition-all text-sm font-medium">
              Add
            </button>
          </div>
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hashtags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 text-[11px] bg-white/[0.06] border border-white/[0.08] rounded-full px-2.5 py-1">
                  #{t}
                  <button onClick={() => setHashtags(h => h.filter(x => x !== t))} className="text-white/30 hover:text-white/60">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <Button onClick={() => createMut.mutate()} disabled={(!caption.trim() && !imageUrl) || createMut.isPending} className="w-full">
          {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
          Share Post
        </Button>
      </div>
    </div>
  );
}

export default function Feed() {
  const [, setLocation] = useLocation();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: ["/api/users/me"] } });

  const { data: posts = [], isLoading } = useQuery<Post[]>({
    queryKey: ["/api/social/posts", activeTag],
    queryFn: () => apiFetch<Post[]>(`/social/posts${activeTag ? `?tag=${activeTag}` : ""}`),
  });

  const likeMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/social/posts/${id}/like`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/social/posts"] }),
  });
  const unlikeMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/social/posts/${id}/like`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/social/posts"] }),
  });

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-4 animate-slide-up-fade">
        {/* Header */}
        <header className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-0.5">Community</p>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400/80" /> Feed
            </h1>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> Post
          </Button>
        </header>

        {/* Active tag filter */}
        {activeTag && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40">Filtering by</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white/[0.08] border border-white/[0.1] rounded-full px-3 py-1.5">
              #{activeTag}
              <button onClick={() => setActiveTag(null)} className="text-white/40 hover:text-white/70">
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
        )}

        {/* Posts */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-white/30" /></div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-white/[0.07]">
            <Sparkles className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm font-semibold text-white/40">
              {activeTag ? `No posts tagged #${activeTag}` : "No posts yet"}
            </p>
            <p className="text-xs text-white/25 mt-1">Be the first to share your progress!</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Create Post
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onLike={id => likeMut.mutate(id)}
                onUnlike={id => unlikeMut.mutate(id)}
                onTagClick={setActiveTag}
                onUserClick={id => setLocation(`/users/${id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreatePostModal onClose={() => setShowCreate(false)} onSuccess={() => {}} />}
    </AppLayout>
  );
}
