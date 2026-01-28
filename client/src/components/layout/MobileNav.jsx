import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  CloudIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';

const mobileNav = [
  { name: 'Home', href: '/', icon: HomeIcon },
  { name: 'Dashboard', href: '/dashboard', icon: ChartBarIcon },
  { name: 'Claude', href: '/claude', icon: ChatBubbleLeftRightIcon },
  { name: 'Weather', href: '/weather', icon: CloudIcon },
  { name: 'More', href: '/todo', icon: Squares2X2Icon },
];

function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 lg:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {mobileNav.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-16 h-full text-xs font-medium transition-colors ${
                isActive
                  ? 'text-accent-500'
                  : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <item.icon className="w-6 h-6 mb-1" />
            {item.name}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default MobileNav;
