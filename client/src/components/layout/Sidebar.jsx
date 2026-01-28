import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  HomeModernIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  CloudIcon,
  CheckCircleIcon,
  MusicalNoteIcon,
  WrenchIcon,
  PlayIcon,
  DocumentTextIcon,
  XMarkIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'Home', href: '/', icon: HomeIcon },
  { name: 'Smart Home', href: '/home-automation', icon: HomeModernIcon },
  { name: 'Markets', href: '/dashboard', icon: ChartBarIcon },
  { name: 'Claude', href: '/claude', icon: ChatBubbleLeftRightIcon },
  { name: 'Weather', href: '/weather', icon: CloudIcon },
  { name: 'To-Do', href: '/todo', icon: CheckCircleIcon },
  { name: 'Music', href: '/music', icon: MusicalNoteIcon },
  { name: 'Tools', href: '/tools', icon: WrenchIcon },
  { name: 'YouTube', href: '/youtube', icon: PlayIcon },
  { name: 'Network', href: '/network', icon: SignalIcon },
  { name: 'Logs', href: '/logs', icon: DocumentTextIcon },
];

function Sidebar({ onClose }) {
  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <img src="/favicon.png" alt="Skye" className="w-7 h-7" />
          <span className="text-xl font-semibold text-slate-900 dark:text-white">Skye</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <XMarkIcon className="w-6 h-6 text-slate-500" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {navigation.map((item) => (
            <li key={item.name}>
              <NavLink
                to={item.href}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? 'bg-accent-50 text-accent-600 dark:bg-accent-900/20 dark:text-accent-400'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700/50'
                  }`
                }
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700">
        <p className="text-xs text-slate-500 dark:text-slate-500">
          Skye v2.0.0
        </p>
      </div>
    </div>
  );
}

export default Sidebar;
