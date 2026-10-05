'use client';
import { STATUS } from '@/lib/format';

export const Badge = ({ s, label }: { s: string; label?: string }) => <span className={`badge b-${s}`}>{label || STATUS[s] || s}</span>;
export const Err = ({ msg }: { msg?: string | null }) => (msg ? <div className="alert err" role="alert">{msg}</div> : null);
export const Loading = () => <p className="muted">Loading…</p>;

export function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? 'wide' : ''}><label>{label}</label>{children}</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="head" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>{title}</h2><button className="btn sm" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}
