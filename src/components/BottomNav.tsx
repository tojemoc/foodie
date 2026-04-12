import { useLocation, useNavigate } from 'react-router-dom';

const tabs = [
  { path: '/', icon: '📦', label: 'Items' },
  { path: '/locations', icon: '📍', label: 'Locations' },
  { path: '/settings', icon: '⚙️', label: 'Settings' },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <button
          key={tab.path}
          className={`nav-item ${location.pathname === tab.path ? 'active' : ''}`}
          onClick={() => navigate(tab.path)}
        >
          <span className="icon">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
