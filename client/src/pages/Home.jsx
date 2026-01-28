import { Link } from 'react-router-dom';
import {
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  CloudIcon,
  CheckCircleIcon,
  MusicalNoteIcon,
  WrenchIcon,
  PlayIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

const links = [
  {
    name: 'Dashboard',
    description: 'Stock prices, portfolio & charts',
    href: '/dashboard',
    icon: ChartBarIcon,
    color: 'from-blue-500 to-blue-600',
  },
  {
    name: 'Claude',
    description: 'Anthropic AI assistant',
    href: '/claude',
    icon: ChatBubbleLeftRightIcon,
    color: 'from-orange-500 to-orange-600',
  },
  {
    name: 'Weather',
    description: 'Dublin forecast & sun times',
    href: '/weather',
    icon: CloudIcon,
    color: 'from-sky-500 to-sky-600',
  },
  {
    name: 'To-Do',
    description: 'Task list & notes',
    href: '/todo',
    icon: CheckCircleIcon,
    color: 'from-green-500 to-green-600',
  },
  {
    name: 'Music',
    description: 'Artist discovery',
    href: '/music',
    icon: MusicalNoteIcon,
    color: 'from-pink-500 to-pink-600',
  },
  {
    name: 'Tools',
    description: 'VRT calculator & utilities',
    href: '/tools',
    icon: WrenchIcon,
    color: 'from-slate-500 to-slate-600',
  },
  {
    name: 'YouTube',
    description: 'Playlists & downloads',
    href: '/youtube',
    icon: PlayIcon,
    color: 'from-red-500 to-red-600',
  },
  {
    name: 'Logs',
    description: 'System activity',
    href: '/logs',
    icon: DocumentTextIcon,
    color: 'from-amber-500 to-amber-600',
  },
];

function Home() {
  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Welcome to Skye
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Your personal dashboard for everything
        </p>
      </div>

      {/* Quick Links Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {links.map((link) => (
          <Link
            key={link.name}
            to={link.href}
            className="card p-5 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group"
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${link.color} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}
              >
                <link.icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                  {link.name}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {link.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default Home;
