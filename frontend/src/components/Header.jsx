'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useMemo, useState } from 'react';
import { Mail, LogOut, Menu, X, Home, Workflow, PenSquare, ScrollText } from 'lucide-react';

export default function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const user = session?.user;
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = useMemo(
    () => [
      { href: '/', label: 'Home', icon: Home },
      { href: '/compose', label: 'Compose', icon: PenSquare },
      { href: '/automation', label: 'Automation', icon: Workflow },
      { href: '/sheet-logs', label: 'Sheet Logs', icon: ScrollText },
    ],
    []
  );

  const isActive = (href) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname?.startsWith(href);
  };

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  return (
    <header className="header-glass">
      <div className="header-inner">
        <div className="header-left">
          <Link href="/" className="header-logo">
            <div className="header-logo-icon">
              <Mail size={18} />
            </div>
            <span className="header-logo-text">DraftPal</span>
          </Link>
        </div>

        <div className="header-center">
          <nav className="header-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`header-nav-link ${isActive(item.href) ? 'header-nav-link--active' : ''}`}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        
        <div className="header-right">
          {user && (
            <div className="header-user">
              {user.image && (
                <Image
                  className="header-avatar"
                  src={user.image}
                  alt={user.name}
                  width={30}
                  height={30}
                />
              )}
              <span className="header-username">{user.name}</span>
              <button
                onClick={handleLogout}
                className="header-signout"
              >
                <LogOut size={14} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
        
        {/* Mobile toggle */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="header-mobile-toggle"
        >
          {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="header-mobile-menu">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`header-mobile-link ${isActive(item.href) ? 'header-mobile-link--active' : ''}`}
                onClick={() => setIsMenuOpen(false)}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
          <div className="header-mobile-divider"></div>
          {user && (
            <div className="header-mobile-user">
              <div className="header-mobile-user-info">
                {user.image && (
                  <Image className="header-avatar" src={user.image} alt={user.name} width={30} height={30} />
                )}
                <div>
                  <div className="header-mobile-name">{user.name}</div>
                  <div className="header-mobile-email">{user.email}</div>
                </div>
              </div>
              <button onClick={handleLogout} className="header-mobile-signout">
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .header-glass {
          background: linear-gradient(180deg, rgba(1, 8, 20, 0.95), rgba(5, 12, 24, 0.9));
          backdrop-filter: blur(30px);
          -webkit-backdrop-filter: blur(30px);
          border-bottom: 1px solid rgba(15, 152, 254, 0.15);
          position: sticky;
          top: 0;
          z-index: 50;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .header-inner {
          max-width: 1600px;
          margin: 0 auto;
          padding: 0 1.5rem;
          height: 70px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 1.5rem;
        }

        .header-left {
          display: flex;
          align-items: center;
          justify-self: start;
        }

        .header-center {
          display: flex;
          justify-content: center;
          justify-self: center;
          min-width: 0;
        }

        .header-logo {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          text-decoration: none;
          flex-shrink: 0;
        }

        .header-logo-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 10px 28px rgba(37, 99, 235, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          overflow: hidden;
        }

        .header-logo-icon::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.1) 50%, transparent 70%);
          transform: translateX(-100%);
          transition: transform 0.6s;
        }

        .header-logo:hover .header-logo-icon {
          transform: translateY(-3px);
          box-shadow: 0 14px 36px rgba(37, 99, 235, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }

        .header-logo:hover .header-logo-icon::before {
          transform: translateX(100%);
        }

        .header-logo-text {
          font-size: 1.25rem;
          font-weight: 800;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, #f0f9ff 0%, #38bdf8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .header-nav {
          display: flex;
          gap: 0.65rem;
          padding: 0.55rem 0.75rem;
          background: rgba(15, 23, 42, 0.4);
          item-align: center;
          border-radius: 14px;
          backdrop-filter: blur(10px);
        }

        .header-nav-link {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.58rem 1rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 600;
          color: #cbd5e1;
          text-decoration: none;
          transition: transform 0.2s ease, background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
        }

        .header-nav-link:hover {
          color: #f0f9ff;
          background: rgba(15, 152, 254, 0.15);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(15, 152, 254, 0.22);
        }

        .header-nav-link--active {
          color: #e0f2fe;
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.55), rgba(14, 165, 233, 0.5));
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(125, 211, 252, 0.4);
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 1rem;
          justify-self: end;
        }

        .header-user {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.4rem 0.6rem 0.4rem 0.4rem;
          border-radius: 10px;
          border: 1px solid rgba(15, 152, 254, 0.25);
          background: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
        }

        .header-user:hover {
          border-color: rgba(15, 152, 254, 0.4);
          background: rgba(15, 23, 42, 0.7);
        }

        .header-avatar {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 2px solid rgba(56, 189, 248, 0.6);
          object-fit: cover;
          box-shadow: 0 4px 12px rgba(15, 152, 254, 0.25);
        }

        .header-username {
          font-size: 0.85rem;
          font-weight: 600;
          color: #e2e8f0;
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .header-signout {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.9rem;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.3);
          background: rgba(2, 6, 23, 0.6);
          color: #cbd5e1;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .header-signout::before {
          content: '';
          position: absolute;
          inset: 0;
          background: rgba(239, 68, 68, 0.2);
          transform: translateX(-100%);
          transition: transform 0.3s ease;
        }

        .header-signout:hover {
          background: rgba(239, 68, 68, 0.25);
          border-color: rgba(239, 68, 68, 0.5);
          color: #fecaca;
        }

        .header-signout:hover::before {
          transform: translateX(0);
        }

        /* Mobile */
        .header-mobile-toggle {
          display: none;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(15, 152, 254, 0.3);
          color: #cbd5e1;
          cursor: pointer;
          padding: 0.6rem;
          border-radius: 10px;
          transition: all 0.3s ease;
        }

        .header-mobile-toggle:hover {
          background: rgba(15, 152, 254, 0.2);
          color: #e2e8f0;
          border-color: rgba(15, 152, 254, 0.5);
        }

        .header-mobile-menu {
          padding: 1rem 1.5rem 1.5rem;
          border-top: 1px solid rgba(15, 152, 254, 0.15);
          background: rgba(2, 6, 23, 0.9);
          animation: headerMenuIn 0.3s ease;
        }

        @keyframes headerMenuIn {
          from { 
            opacity: 0; 
            transform: translateY(-12px); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0); 
          }
        }

        .header-mobile-link {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.8rem 1rem;
          border-radius: 10px;
          color: #cbd5e1;
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 600;
          transition: all 0.3s ease;
          margin-bottom: 0.5rem;
        }

        .header-mobile-link:hover {
          background: rgba(15, 152, 254, 0.15);
          color: #e2e8f0;
          transform: translateX(4px);
        }

        .header-mobile-link--active {
          color: #e0f2fe;
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.55), rgba(14, 165, 233, 0.5));
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
        }

        .header-mobile-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(15, 152, 254, 0.2), transparent);
          margin: 0.75rem 0;
        }

        .header-mobile-user {
          padding: 1rem 0 0;
        }

        .header-mobile-user-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          border-radius: 10px;
          background: rgba(15, 23, 42, 0.4);
        }

        .header-mobile-name {
          font-size: 0.9rem;
          font-weight: 600;
          color: #e2e8f0;
        }

        .header-mobile-email {
          font-size: 0.8rem;
          color: #94a3b8;
        }

        .header-mobile-signout {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.75rem 1rem;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: none;
          color: #cbd5e1;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-top: 0.5rem;
        }

        .header-mobile-signout:hover {
          background: rgba(239, 68, 68, 0.2);
          color: #fecaca;
          border-color: rgba(239, 68, 68, 0.4);
        }

        @media (max-width: 768px) {
          .header-nav,
          .header-right {
            display: none;
          }

          .header-mobile-toggle {
            display: flex;
          }

          .header-inner {
            height: 64px;
            padding: 0 1rem;
            gap: 1rem;
          }

          .header-left {
            gap: 1rem;
          }
        }

        @media (min-width: 769px) {
          .header-mobile-menu {
            display: none;
          }
        }
      `}</style>
    </header>
  );
}
