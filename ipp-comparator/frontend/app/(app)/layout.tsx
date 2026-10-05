'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth, isInternal, useLoad } from '@/lib/auth';
import { api } from '@/lib/api';
import { Loading } from '@/components/ui';

const ROLE: Record<string, string> = { admin: 'Admin', procurement: 'Procurement', reviewer: 'Reviewer', viewer: 'Viewer', ges: 'Green Energy Subscriber' };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const path = usePathname();
  const { data: notes } = useLoad<any[]>(() => (user ? api('/notifications') : Promise.resolve([])), [user?.id, path]);
  useEffect(() => { if (!loading && !user) window.location.href = '/login'; }, [loading, user]);
  if (loading || !user) return <div className="main"><Loading /></div>;

  const unread = (notes || []).filter((n) => !n.is_read).length;
  const internal = isInternal(user);
  const links = [
    { href: '/', label: 'Dashboard' },
    { href: '/requirements', label: internal ? 'Requirements' : 'My requirements' },
    ...(internal ? [{ href: '/ipps', label: 'IPPs' }, { href: '/charges', label: 'State charges' }] : []),
    ...(['admin', 'reviewer', 'viewer'].includes(user.role) ? [{ href: '/audit', label: 'Audit log' }] : []),
    { href: '/notifications', label: 'Notifications', badge: unread },
  ];
  const on = (h: string) => (h === '/' ? path === '/' : path.startsWith(h));

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">IPP <span>Comparator</span></div>
        <nav className="nav">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={on(l.href) ? 'on' : ''}>
              {l.label}{l.badge ? <span className="badge b-feasible">{l.badge}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="me">
          <div style={{ fontWeight: 600 }}>{user.name}</div>
          <div className="muted">{ROLE[user.role]}</div>
          <button className="btn sm" style={{ marginTop: 8 }} onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
