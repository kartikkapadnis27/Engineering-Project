import { Bell, Menu, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL, getAuthHeaders } from '../lib/api';

type NotificationRow = { id: string; title: string; message: string; isRead: boolean; createdAt: string };

export function Header() {
  const { user, logout, token } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const loadNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/notifications`, { headers: getAuthHeaders(false) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Unable to load notifications.');
      setNotifications(result.data.notifications as NotificationRow[]);
      setUnreadCount(Number(result.data.unreadCount ?? 0));
      setNotificationError('');
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Unable to load notifications.');
    }
  }, [token]);

  useEffect(() => {
    setNotifications([]);
    setUnreadCount(0);
    if (!user) return;
    void loadNotifications();
    const interval = window.setInterval(() => void loadNotifications(), 30_000);
    return () => window.clearInterval(interval);
  }, [loadNotifications, user]);

  const markNotificationRead = async (notification: NotificationRow) => {
    if (notification.isRead) return;
    try {
      const response = await fetch(`${API_BASE_URL}/notifications/${notification.id}/read`, {
        method: 'PATCH',
        headers: getAuthHeaders(false),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Unable to mark notification read.');
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, isRead: true } : item));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Unable to mark notification read.');
    }
  };

  const markAllRead = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/notifications/read-all`, { method: 'PATCH', headers: getAuthHeaders(false) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Unable to mark notifications read.');
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Unable to mark notifications read.');
    }
  };
  const navItems = [
    { label: 'Home', to: '/' },
    { label: 'Buy Projects', to: '/projects' },
    { label: 'Sell Projects', to: '/sell-project' },
    { label: 'Developer Zone', to: '/#developer-zone' },
    { label: 'Pricing', to: '/#pricing' },
    { label: 'About Us', to: '/about' },
    ...(user?.role === 'ADMIN'
      ? [{ label: 'Owner Console', to: '/owner/dashboard' }]
      : []),
    ...(user?.role === 'BUYER' ? [{ label: 'College Access', to: '/institution-access' }] : [])
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="container flex items-center justify-between py-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-xs font-extrabold tracking-tight text-white shadow-sm shadow-sky-600/20">EP</div>
          <div>
            <div className="whitespace-nowrap text-base font-bold text-slate-900 sm:text-lg">Engineering Project</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-4 xl:flex">
          {navItems.map((item) => (
            <Link key={item.label} to={item.to} className="text-sm font-medium text-slate-700 transition hover:text-brand-600">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {user ? (
            <>
              <Link to="/sell-project" className="btn-primary whitespace-nowrap">Post Project</Link>
              <div className="relative">
                <button type="button" onClick={() => setNotificationsOpen((open) => !open)} aria-expanded={notificationsOpen} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50">
                  <Bell size={17} />
                  {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-sky-600 px-1 text-[9px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>}
                </button>
                {notificationsOpen && <div className="absolute right-0 top-12 z-50 w-[min(22rem,90vw)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                  <div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-900">Notifications</p><button type="button" onClick={() => void markAllRead()} disabled={unreadCount === 0} className="text-[10px] font-semibold text-sky-700 disabled:text-slate-400">Mark all read</button></div>
                  {notificationError && <p role="alert" className="mt-2 text-xs text-rose-700">{notificationError}</p>}
                  <ul className="mt-2 max-h-80 divide-y divide-slate-100 overflow-auto">{notifications.map((item) => <li key={item.id}><button type="button" onClick={() => void markNotificationRead(item)} className={`w-full rounded-lg px-2 py-2.5 text-left ${item.isRead ? 'text-slate-500' : 'bg-sky-50 text-slate-800'}`}><span className="block text-xs font-semibold">{item.title}</span><span className="mt-1 block text-[11px] leading-4">{item.message}</span><span className="mt-1 block text-[9px] text-slate-400">{new Date(item.createdAt).toLocaleString()}</span></button></li>)}</ul>
                  {notifications.length === 0 && !notificationError && <p className="py-6 text-center text-xs text-slate-500">You are all caught up.</p>}
                </div>}
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <User size={16} />
                <span>{user.email}</span>
              </div>
              <button type="button" onClick={logout} className="text-sm font-medium text-slate-700 hover:text-brand-600">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="whitespace-nowrap text-sm font-medium text-slate-700 hover:text-brand-600">Log In</Link>
              <Link to="/sell-project" className="btn-primary whitespace-nowrap">Post Project</Link>
            </>
          )}
        </div>

        <div className="relative flex items-center gap-2 lg:hidden">
          {user && <button type="button" onClick={() => setNotificationsOpen((open) => !open)} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-700"><Bell size={18} />{unreadCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-sky-600 px-1 text-[9px] text-white">{unreadCount}</span>}</button>}
          <button type="button" onClick={() => setMobileMenuOpen((open) => !open)} aria-expanded={mobileMenuOpen} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700" aria-label="menu">
            <Menu size={18} />
          </button>
          {mobileMenuOpen && <nav className="absolute right-0 top-12 z-40 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            {navItems.map((item) => <Link key={item.label} to={item.to} onClick={() => setMobileMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">{item.label}</Link>)}
            {user ? <><Link to="/sell-project" onClick={() => setMobileMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-50">Post Project</Link><button type="button" onClick={() => { logout(); setMobileMenuOpen(false); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50">Logout</button></> : <><Link to="/login" onClick={() => setMobileMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700">Log In</Link><Link to="/sell-project" onClick={() => setMobileMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-sky-700">Post Project</Link><Link to="/register" onClick={() => setMobileMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500">Create account</Link></>}
          </nav>}
          {user && notificationsOpen && <div className="absolute right-0 top-12 z-50 w-[min(22rem,90vw)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-900">Notifications</p><button type="button" onClick={() => void markAllRead()} disabled={unreadCount === 0} className="text-[10px] font-semibold text-sky-700 disabled:text-slate-400">Mark all read</button></div>
            {notificationError && <p role="alert" className="mt-2 text-xs text-rose-700">{notificationError}</p>}
            <ul className="mt-2 max-h-80 divide-y divide-slate-100 overflow-auto">{notifications.map((item) => <li key={item.id}><button type="button" onClick={() => void markNotificationRead(item)} className={`w-full rounded-lg px-2 py-2.5 text-left ${item.isRead ? 'text-slate-500' : 'bg-sky-50 text-slate-800'}`}><span className="block text-xs font-semibold">{item.title}</span><span className="mt-1 block text-[11px] leading-4">{item.message}</span></button></li>)}</ul>
            {notifications.length === 0 && !notificationError && <p className="py-6 text-center text-xs text-slate-500">You are all caught up.</p>}
          </div>}
        </div>
      </div>
    </header>
  );
}
