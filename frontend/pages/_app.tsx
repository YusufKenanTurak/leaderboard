// frontend/pages/_app.tsx
import React from 'react';
import type { AppProps } from 'next/app';
import { QueryClient, QueryClientProvider } from 'react-query';
import { createGlobalStyle } from 'styled-components';

const queryClient = new QueryClient();

// İsterseniz Google Fonts veya benzeri fontları da burada import edebilirsiniz.
const GlobalStyle = createGlobalStyle`
  /* Reset / global box-sizing */
  * {
    margin: 0; padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: 'Arial', sans-serif;
    background: #0D0A13; /* koyu zemin */
    color: #fff; /* beyaz yazı */
    /* Aşağıda background-image yerine basit degrade (gradient) verebiliriz */
    /* veya .png / .jpg ile "grid" görseli ekleyebilirsiniz. */
    /* Örnek: */
    background: radial-gradient(circle at 50% 50%, #201a2c 0%, #0d0a13 100%);
    min-height: 100vh;
  }

  /* Scrollbar (isteğe bağlı) */
  ::-webkit-scrollbar {
    width: 8px;
    background-color: #0D0A13;
  }
  ::-webkit-scrollbar-thumb {
    background-color: #3c2e5a;
  }
`;

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalStyle />
      <Component {...pageProps} />
    </QueryClientProvider>
  );
}
