'use client';

export function McaPreviewEvidenceLink() {
  return <a href="#mca-preview-original" className="underlink" onClick={() => {
    const evidence = document.getElementById('mca-preview-original');
    if (evidence instanceof HTMLDetailsElement) evidence.open = true;
  }}>查看原始证据</a>;
}
