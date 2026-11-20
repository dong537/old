// Next's Webpack alias chooses the server-only local implementation only in dev-private.
declare module '@mca-preview-data' {
  export function getMcaPreviewCatalog(): import('./lib/mca-preview-types').McaPreviewCatalog | null;
  export function getMcaPreviewIds(): string[];
  export function getMcaPreviewDetail(id: string): import('./lib/mca-preview-types').McaPreviewDetailResult | null;
}
