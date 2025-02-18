/**
 * styles/GlobalStyle.ts
 * Here, we define the .dropdown and .dropdown-item classes at a global level for demonstration purposes only.
 * They can be accessed from anywhere in the application.
 */

import { createGlobalStyle } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
  /* Basic settings for the entire page */
  body {
    margin: 0;
    padding: 0;
    background: #110825;
    font-family: 'Arial', sans-serif;
    color: #fff;
  }

  /* Global classes used by the SuggestionsDropdown component */
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
