import { NavLink } from 'react-router-dom';
import {
  Compass,
  Bookmark,
  BarChart2,
  Bell,
  Wifi,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react';
import styles from './Sidebar.module.css';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const NAV = [
  { to: '/discover',   icon: Compass,   label: 'Discover'       },
  { to: '/watchlist',  icon: Bookmark,  label: 'Watchlist'      },
  { to: '/saturation', icon: BarChart2, label: 'Saturation Map' },
  { to: '/alerts',     icon: Bell,      label: 'Alerts'         },
  { to: '/sources',    icon: Wifi,      label: 'Sources'        },
];

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside className={styles.sidebar} data-collapsed={collapsed}>
      <div className={styles.logo}>
        <div className={styles.logoIcon}><Zap size={18} /></div>
        {!collapsed && <span className={styles.logoText}>TRENDZ</span>}
      </div>

      <nav className={styles.nav}>
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className={styles.navIcon} />
            {!collapsed && <span className={styles.navLabel}>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className={styles.bottom}>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `${styles.navItem} ${isActive ? styles.active : ''}`
          }
          title={collapsed ? 'Settings' : undefined}
        >
          <Settings size={18} className={styles.navIcon} />
          {!collapsed && <span className={styles.navLabel}>Settings</span>}
        </NavLink>

        <button
          className={styles.collapseBtn}
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronRight size={14} />
            : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  );
}
