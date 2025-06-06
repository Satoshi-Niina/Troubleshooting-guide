import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Chat from "@/pages/chat";
import Processing from "@/pages/processing";
import Settings from "@/pages/settings";
import Users from "@/pages/users";
import Documents from "@/pages/documents";
import EmergencyGuide from "@/pages/emergency-guide";
import Troubleshooting from "@/pages/troubleshooting";
import { useAuth, AuthProvider } from "./context/auth-context";
import { ChatProvider } from "./context/chat-context";
import Header from "./components/navigation/header";
import { Tabs } from "./components/navigation/tabs";
import { useEffect } from "react";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return user ? <>{children}</> : null;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) {
      setLocation("/chat");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return user && user.role === 'admin' ? <>{children}</> : null;
}

function Router() {
  const { user } = useAuth();
  const [location] = useLocation();

  const isLoginPage = location === '/login';

  // Separate layout for login page
  if (isLoginPage) {
    return (
      <div className="h-screen">
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="/">
            <Redirect to="/login" />
          </Route>
        </Switch>
      </div>
    );
  }

  // Main app layout for authenticated routes
  return (
    <div className="h-screen flex flex-col">
      {user && <Header />}

      {user && (
        <div className="border-b border-neutral-200">
          <Tabs currentPath={location} />
        </div>
      )}

      <main className="flex-1 flex overflow-hidden">
        <Switch>

          <Route path="/chat">
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          </Route>

          <Route path="/processing">
            <ProtectedRoute>
              <Processing />
            </ProtectedRoute>
          </Route>

          <Route path="/settings">
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          </Route>

          <Route path="/users">
            <ProtectedRoute>
              <AdminRoute>
                <Users />
              </AdminRoute>
            </ProtectedRoute>
          </Route>

          <Route path="/documents">
            <ProtectedRoute>
              <AdminRoute>
                <Documents />
              </AdminRoute>
            </ProtectedRoute>
          </Route>

          <Route path="/emergency-guide">
            <ProtectedRoute>
              <AdminRoute>
                <EmergencyGuide />
              </AdminRoute>
            </ProtectedRoute>
          </Route>

          <Route path="/troubleshooting">
            <ProtectedRoute>
              <AdminRoute>
                <Troubleshooting />
              </AdminRoute>
            </ProtectedRoute>
          </Route>

          <Route path="/">
            {user ? <Redirect to="/chat" /> : <Redirect to="/login" />}
          </Route>

          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ChatProvider>
          <Router />
          <Toaster />
        </ChatProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;