'use client';

import { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';
import TagManager from 'react-gtm-module';
import { Analytics } from '@vercel/analytics/react';

const tagManagerArgs = {
  gtmId: 'GTM-P4M975K',
};

export default function Providers({ children }) {
  useEffect(() => {
    TagManager.initialize(tagManagerArgs);
  }, []);

  return (
    <SessionProvider>
      {children}
      <Analytics />
    </SessionProvider>
  );
}
