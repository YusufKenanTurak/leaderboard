/**
 * _app.tsx is the custom entry point for all Next.js pages.
 * We apply global styles, and wrap the app with QueryClientProvider for react-query usage.
 */

import React from 'react';
import type { AppProps } from 'next/app';
import { QueryClient, QueryClientProvider } from 'react-query';
import { GlobalStyle } from '../styles/GlobalStyle';

const queryClient = new QueryClient();

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalStyle />
      <Component {...pageProps} />
    </QueryClientProvider>
  );
}
