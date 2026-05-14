import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';
import DiscoverPage from '@/features/discover/DiscoverPage';
import WatchlistPage from '@/features/watchlist/WatchlistPage';
import SaturationPage from '@/features/saturation/SaturationPage';
import AlertsPage from '@/features/alerts/AlertsPage';
import SourcesPage from '@/features/sources/SourcesPage';
import SettingsPage from '@/features/settings/SettingsPage';
import { Toaster } from '@/components/Toast';

export default function App() {
  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/discover" replace />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/saturation" element={<SaturationPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Layout>
      <Toaster />
    </>
  );
}
