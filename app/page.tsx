
'use client';

import App from '../App';

/**
 * Next.js entry point.
 * We render the master App component from the root to ensure 
 * correct relative module resolution for types and constants.
 */
export default function Home() {
  return <App />;
}
