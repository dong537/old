'use client';

import React, { useEffect, useState } from 'react';

const revealAfter = 440;

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sync = () => setVisible(window.scrollY >= revealAfter);
    sync();
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('pageshow', sync);
    return () => {
      window.removeEventListener('scroll', sync);
      window.removeEventListener('pageshow', sync);
    };
  }, []);

  return <button type="button" hidden={!visible} aria-label="回到顶部"
    className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-20 min-h-11 min-w-11 rounded border border-brand-line bg-brand font-semibold text-white shadow-card hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    onClick={() => {
      document.getElementById('page-top')?.focus({ preventScroll: true });
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'instant' : 'smooth' });
    }}>
    <span className="flex items-center justify-center gap-1 px-2.5 py-2 text-sm">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V6m-6 6 6-6 6 6" /></svg>
      <span className="sr-only sm:not-sr-only">回到顶部</span>
    </span>
  </button>;
}
