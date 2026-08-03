import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { initAuth } from '@/lib/auth';

// Initialize auth token getter for API client
initAuth();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Import pages
import Login from '@/pages/auth/login';
import Register from '@/pages/auth/register';
import Dashboard from '@/pages/dashboard';
import Quests from '@/pages/quests';
import Profile from '@/pages/profile';
import Onboarding from '@/pages/onboarding';
import Leaderboard from '@/pages/leaderboard';
import Feed from '@/pages/feed';
import UserProfilePage from '@/pages/user-profile';

function AuthRedirect() {
  const [, setLocation] = useLocation();
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setLocation("/auth/login");
    } else {
      setLocation("/dashboard");
    }
  }
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={AuthRedirect} />
      <Route path="/auth/login" component={Login} />
      <Route path="/auth/register" component={Register} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/quests" component={Quests} />
      <Route path="/profile" component={Profile} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/feed" component={Feed} />
      <Route path="/users/:id" component={UserProfilePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
