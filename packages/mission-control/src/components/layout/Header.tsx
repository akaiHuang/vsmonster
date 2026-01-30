'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, LayoutGrid, BarChart3, Settings } from 'lucide-react';
import clsx from 'clsx';

const navItems = [
  { href: '/', label: 'Tasks', icon: LayoutGrid },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-dark-border bg-dark-bg/95 backdrop-blur">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <button className="p-2 hover:bg-dark-hover rounded-lg transition-colors">
              <Menu className="w-5 h-5 text-gray-400" />
            </button>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <span className="text-2xl">🎮</span>
              <span>Mission Control</span>
            </h1>
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'text-white bg-dark-hover'
                      : 'text-gray-400 hover:text-white hover:bg-dark-hover'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
