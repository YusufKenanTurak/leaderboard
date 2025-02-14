/**
 * styles/GlobalStyle.ts
 * Burada yalnızca örnek amaçlı olarak .dropdown ve .dropdown-item
 * class'larını global düzeyde tanımlıyoruz. Uygulamanın her yerinden erişilebilir.
 */

import { createGlobalStyle } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
  /* Tüm sayfa için temel ayarlar */
  body {
    margin: 0;
    padding: 0;
    background: #110825;
    font-family: 'Arial', sans-serif;
    color: #fff;
  }

  /* SuggestionsDropdown bileşeninin kullandığı global class'lar */
  .dropdown {
    position: absolute;
    top: 42px;
    left: 0;
    width: 240px;
    max-height: 200px;
    background: #1d1335;
    border: 1px solid #3a2d5d;
    border-radius: 5px;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    z-index: 999;
  }

  .dropdown-item {
    padding: 0.5rem 1rem;
    color: #fff;
    cursor: pointer;
  }

  .dropdown-item:hover {
    background: #2a1f4a;
  }
`;
