'use client';

import { SocketProvider } from '@/lib/socket-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SocketProvider>{children}</SocketProvider>
  );
}
