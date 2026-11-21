import React from 'react';

export type InstitutionServiceIconKind = 'content' | 'team' | 'time' | 'range' | 'notes';

/** The five service rows use the same visual cue in public and local detail views. */
export function InstitutionServiceIcon({ kind }: { kind: InstitutionServiceIconKind }) {
  const glyph = {
    content: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    team: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 3.5 4.8V20" /></>,
    time: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
    range: <><circle cx="12" cy="5" r="2" /><circle cx="5" cy="18" r="2" /><circle cx="19" cy="18" r="2" /><path d="M11 7 6 16M13 7l5 9M7 18h10" /></>,
    notes: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h3" /></>,
  }[kind];
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-[#404A50]">{glyph}</svg>;
}
