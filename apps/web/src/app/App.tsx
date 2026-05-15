import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';
import DiscoverPage from '@/features/discover/DiscoverPage';
import WatchlistPage from '@/features/watchlist/WatchlistPage';
import SaturationPage from '@/features/saturation/SaturationPage';
import AlertsPage from '@/features/alerts/AlertsPage';
import SourcesPage from '@/features/sources/SourcesPage';
import SettingsPage from '@/features/settings/SettingsPage';
import { Toaster } from '@/components/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/discover" replace />} />
          <Route path="/discover"   element={<ErrorBoundary><DiscoverPage   /></ErrorBoundary>} />
          <Route path="/watchlist"  element={<ErrorBoundary><WatchlistPage  /></ErrorBoundary>} />
          <Route path="/saturation" element={<ErrorBoundary><SaturationPage /></ErrorBoundary>} />
          <Route path="/alerts"     element={<ErrorBoundary><AlertsPage     /></ErrorBoundary>} />
          <Route path="/sources"    element={<ErrorBoundary><SourcesPage    /></ErrorBoundary>} />
          <Route path="/settings"   element={<ErrorBoundary><SettingsPage   /></ErrorBoundary>} />
        </Routes>
      </Layout>
      <Toaster />
    </ErrorBoundary>
  );
}
