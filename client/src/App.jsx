import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Claude from './pages/Claude';
import Weather from './pages/Weather';
import Todo from './pages/Todo';
import Music from './pages/Music';
import Tools from './pages/Tools';
import YouTube from './pages/YouTube';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Network from './pages/Network';
import HomeAutomation from './pages/HomeAutomation';
import PlatformHealth from './pages/PlatformHealth';
import useThemeStore from './store/themeStore';
import { useNetworkMonitor } from './hooks/useNetworkMonitor';
import { useTodoReminders } from './hooks/useTodoReminders';
import { usePlatformHealthMonitor } from './hooks/usePlatformHealthMonitor';

function App() {
  const { isDark } = useThemeStore();

  // Start global network monitoring for connection alerts
  // This runs regardless of which page the user is viewing
  useNetworkMonitor();

  // Start global to-do reminder notifications
  // Checks for items due today and shows browser notifications
  useTodoReminders();

  // Start global platform health monitoring for dependency outage alerts
  // Monitors Claude, OCI, and other platform statuses
  usePlatformHealthMonitor();

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/home-automation" element={<HomeAutomation />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/claude" element={<Claude />} />
        <Route path="/weather" element={<Weather />} />
        <Route path="/todo" element={<Todo />} />
        <Route path="/music" element={<Music />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/youtube" element={<YouTube />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/network" element={<Network />} />
        <Route path="/platform-health" element={<PlatformHealth />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}

export default App;
