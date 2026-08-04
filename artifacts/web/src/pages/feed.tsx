import { useState, useRef } from "react";
import AppLayout from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Loader2, Heart, Hash, X, Play, Sparkles, Film, Image as ImageIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function getToken() { return localStorage.getItem("accessToken"); }
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      ...(opts?.headers ?? {}),
      Authorization: `Bearer ${getToken()}`,
      ...((opts?.headers as any)?.["Content-Type"] !== undefined ? {} : { "Content-Type": "application/json" }),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface Post {
  id: string;
  caption: string | null;
  image_url: string | null;
  video_url: string | null;
  hashtags: string[];
  likes_count: number;
  created_at: string;
  post_type: string;
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

function mediaUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `/api/social/objects${path.replace(/^\/objects/, "")}`;
}

function PostCard({ post, onLike, onUnlike, onTagClick, onUserClick }: {
  post: Post;
  onLike: (id: string) => void;
  onUnlike: (id: string) => void;
  onTagClick: (tag: string) => void;
  onUserClick: (id: string) => void;
}) {
  const avatarSrc = mediaUrl(post.avatar_url);
  const imgSrc = mediaUrl(post.image_url);
  const videoSrc = mediaUrl(post.video_url);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toggleVideo = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) { videoRef.current.play(); setVideoPlaying(true); }
    else { videoRef.current.pause(); setVideoPlaying(false); }
  };

  return (
    <article className="glass-heavy border border-white/[0.08] rounded-2xl overflow-hidden">
      {/* User header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <button onClick={() => onUserClick(post.user_id)}
          className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden hover:opacity-80 transition-opacity">
          {avatarSrc ? <img src={avatarSrc} className="w-full h-full object-cover" alt="" /> : (post.display_name || post.username).charAt(0).toUpperCase()}
        </button>
        <div className="flex-1 min-w-0">
          <button onClick={() => onUserClick(post.user_id)} className="text-sm font-semibold hover:text-white/70 transition-colors">
            {post.display_name || post.username}
          </button>
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-white/30">@{post.username} · {timeAgo(post.created_at)}</p>
            {post.post_type === "clip" && <span className="text-[9px] font-bold text-purple-400/80 bg-purple-400/10 rounded-full px-2 py-0.5 flex items-center gap-1"><Film className="w-2.5 h-2.5" />Clip</span>}
          </div>
        </div>
      </div>

      {/* Video */}
      {videoSrc && (
        <div className="px-4 pb-3">
          <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[480px]">
            <video
              ref={videoRef}
              src={videoSrc}
              className="w-full h-full object-contain"
              loop
              playsInline
              onEnded={() => setVideoPlaying(false)}
            />
            <button onClick={toggleVideo}
              className="absolute inset-0 flex items-center justify-center">
              {!videoPlaying && (
                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
                  <Play className="w-6 h-6 text-white fill-white ml-1" />
                </div>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Image */}
      {imgSrc && !videoSrc && (
        <div className="px-4 pb-3">
          <img src={imgSrc} className="w-full rounded-xl object-cover max-h-80" alt="Post" />
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
          className={cn("flex items-center gap-1.5 text-xs font-semibold transition-all active:scale-90",
            post.liked_by_me ? "text-red-400" : "text-white/30 hover:text-white/60")}>
          <Heart className={cn("w-4 h-4 transition-all", post.liked_by_me && "fill-current scale-110")} />
          {post.likes_count}
        </button>
      </div>
    </article>
  );
}

function ClipCard({ post, onLike, onUnlike, onUserClick }: {
  post: Post;
  onLike: (id: string) => void;
  onUnlike: (id: string) => void;
  onUserClick: (id: string) => void;
}) {
  const videoSrc = mediaUrl(post.video_url);
  const avatarSrc = mediaUrl(post.avatar_url);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toggle = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) { videoRef.current.play(); setPlaying(true); }
    else { videoRef.current.pause(); setPlaying(false); }
  };

  if (!videoSrc) return null;

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black aspect-[9/16] w-full max-w-sm mx-auto border border-white/[0.08]">
      <video ref={videoRef} src={videoSrc} className="w-full h-full object-contain" loop playsInline onEnded={() => setPlaying(false)} />
      <button onClick={toggle} className="absolute inset-0" />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
            <Play className="w-7 h-7 text-white fill-white ml-1" />
          </div>
        </div>
      )}
      {/* Overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
        <button onClick={() => onUserClick(post.user_id)} className="flex items-center gap-2 mb-2 pointer-events-auto">
          <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white/40 bg-white/10 flex items-center justify-center text-xs font-bold">
            {avatarSrc ? <img src={avatarSrc} className="w-full h-full object-cover" alt="" /> : (post.display_name || post.username).charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-white">{post.display_name || post.username}</span>
        </button>
        {post.caption && <p className="text-sm text-white/80 line-clamp-2 mb-1">{post.caption}</p>}
      </div>
      {/* Like button */}
      <button
        onClick={() => post.liked_by_me ? onUnlike(post.id) : onLike(post.id)}
        className={cn("absolute right-4 bottom-20 flex flex-col items-center gap-1 transition-all active:scale-90",
          post.liked_by_me ? "text-red-400" : "text-white/60")}>
        <Heart className={cn("w-6 h-6 drop-shadow", post.liked_by_me && "fill-current")} />
        <span className="text-[11px] font-bold drop-shadow">{post.likes_count}</span>
      </button>
    </div>
  );
}

export default function Feed() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"posts" | "clips">("posts");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: posts = [], isLoading: loadingPosts } = useQuery<Post[]>({
    queryKey: ["/api/social/posts/personalized", activeTag],
    queryFn: () => {
      const url = activeTag
        ? `/social/posts?tag=${activeTag}&type=post`
        : `/social/posts/personalized?type=post`;
      return apiFetch<Post[]>(url);
    },
    enabled: activeTab === "posts",
  });

  const { data: clips = [], isLoading: loadingClips } = useQuery<Post[]>({
    queryKey: ["/api/social/posts/personalized/clips"],
    queryFn: () => apiFetch<Post[]>("/social/posts?type=clip"),
    enabled: activeTab === "clips",
  });

  const likeMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/social/posts/${id}/like`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/social/posts"] }); qc.invalidateQueries({ queryKey: ["/api/social/posts/personalized"] }); },
  });
  const unlikeMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/social/posts/${id}/like`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/social/posts"] }); qc.invalidateQueries({ queryKey: ["/api/social/posts/personalized"] }); },
  });

  const isLoading = activeTab === "posts" ? loadingPosts : loadingClips;
  const items = activeTab === "posts" ? posts : clips;

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
        </header>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-white/[0.04] rounded-xl border border-white/[0.06]">
          {([
            { key: "posts" as const, label: "Posts", icon: ImageIcon },
            { key: "clips" as const, label: "Short Clips", icon: Film },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => { setActiveTab(key); setActiveTag(null); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all",
                activeTab === key ? "bg-white text-black shadow-sm" : "text-white/50 hover:text-white/80"
              )}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* Tag filter (posts only) */}
        {activeTag && activeTab === "posts" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40">Filtering by</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white/[0.08] border border-white/[0.1] rounded-full px-3 py-1.5">
              #{activeTag}
              <button onClick={() => setActiveTag(null)} className="text-white/40 hover:text-white/70"><X className="w-3 h-3" /></button>
            </span>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-white/30" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-white/[0.07]">
            <Sparkles className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm font-semibold text-white/40">
              {activeTag ? `No posts tagged #${activeTag}` : activeTab === "clips" ? "No clips yet" : "No posts yet"}
            </p>
            <p className="text-xs text-white/25 mt-1">
              {activeTab === "clips" ? "Upload short clips from your Profile page" : "Share your progress from your Profile page"}
            </p>
          </div>
        ) : activeTab === "clips" ? (
          <div className="space-y-4">
            {clips.map(post => (
              <ClipCard key={post.id} post={post}
                onLike={id => likeMut.mutate(id)} onUnlike={id => unlikeMut.mutate(id)}
                onUserClick={id => setLocation(`/users/${id}`)} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map(post => (
              <PostCard key={post.id} post={post}
                onLike={id => likeMut.mutate(id)} onUnlike={id => unlikeMut.mutate(id)}
                onTagClick={setActiveTag} onUserClick={id => setLocation(`/users/${id}`)} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
