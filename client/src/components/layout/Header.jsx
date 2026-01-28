import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bars3Icon, MoonIcon, SunIcon, ArrowPathIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import useThemeStore from '../../store/themeStore';
import { systemApi } from '../../services/api';

function Header({ onMenuClick }) {
  const { isDark, toggleTheme } = useThemeStore();
  const [isRestarting, setIsRestarting] = useState(false);

  const handleRestart = async () => {
    if (isRestarting) return;

    setIsRestarting(true);
    toast.loading('Restarting server...', { id: 'restart' });

    try {
      await systemApi.restart();
      // Server will restart, wait a moment then reload the page
      setTimeout(() => {
        toast.success('Server restarted, reloading...', { id: 'restart' });
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }, 1500);
    } catch (error) {
      // Server might already be restarting if we get a network error
      if (error.code === 'ERR_NETWORK' || error.message.includes('Network Error')) {
        setTimeout(() => {
          toast.success('Server restarting, reloading...', { id: 'restart' });
          setTimeout(() => {
            window.location.reload();
          }, 500);
        }, 1500);
      } else {
        toast.error('Failed to restart server', { id: 'restart' });
        setIsRestarting(false);
      }
    }
  };

  return (
    <header className="sticky top-0 z-20 h-16 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between h-full px-4">
        {/* Mobile Menu Button */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <Bars3Icon className="w-6 h-6 text-slate-600 dark:text-slate-400" />
        </button>

        {/* Spacer for desktop */}
        <div className="hidden lg:block" />

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          {/* Restart Button */}
          <button
            onClick={handleRestart}
            disabled={isRestarting}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            aria-label="Restart server"
            title="Restart server"
          >
            <ArrowPathIcon className={`w-5 h-5 text-slate-600 dark:text-slate-400 hover:text-accent-600 dark:hover:text-accent-400 ${isRestarting ? 'animate-spin' : ''}`} />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Toggle theme"
          >
            {isDark ? (
              <SunIcon className="w-5 h-5 text-slate-400 hover:text-accent-400" />
            ) : (
              <MoonIcon className="w-5 h-5 text-slate-600 hover:text-accent-600" />
            )}
          </button>

          {/* Settings */}
          <Link
            to="/settings"
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Settings"
            title="Settings"
          >
            <Cog6ToothIcon className="w-5 h-5 text-slate-600 dark:text-slate-400 hover:text-accent-600 dark:hover:text-accent-400" />
          </Link>
        </div>
      </div>
    </header>
  );
}

export default Header;
