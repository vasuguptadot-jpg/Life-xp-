import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4 text-center">
      <div className="text-primary font-mono text-sm mb-4 tracking-widest uppercase">Error 404</div>
      <h1 className="text-6xl font-black tracking-tighter text-glow mb-4">Signal Lost</h1>
      <p className="text-muted-foreground font-mono max-w-md mx-auto mb-8">
        The requested coordinates do not exist in the current sector. 
        Return to base to re-establish connection.
      </p>
      <Link href="/">
        <Button size="lg" className="font-bold tracking-widest uppercase">
          Return to Dashboard
        </Button>
      </Link>
    </div>
  );
}
