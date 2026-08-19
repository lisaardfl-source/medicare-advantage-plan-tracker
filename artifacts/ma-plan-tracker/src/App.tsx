import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

// Layout & Components
import { Layout } from '@/components/layout';
import NotFound from '@/pages/not-found';

// Pages
import Dashboard from '@/pages/dashboard';
import PlansList from '@/pages/plans/index';
import PlanDetail from '@/pages/plans/[id]';
import CountiesBrowser from '@/pages/counties';
import Enrollments from '@/pages/enrollments';
import SummaryAnalytics from '@/pages/summary';
import ConcentrationPage from '@/pages/concentration';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    }
  }
});

function Router() {
  return (
    <Layout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/plans" component={PlansList} />
          <Route path="/plans/:id" component={PlanDetail} />
          <Route path="/counties" component={CountiesBrowser} />
          <Route path="/enrollments" component={Enrollments} />
          <Route path="/summary" component={SummaryAnalytics} />
          <Route path="/concentration" component={ConcentrationPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Layout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
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
