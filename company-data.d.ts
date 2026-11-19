// Runtime implementation is selected only by next.config.mjs.
// No TypeScript path mapping: Next's module rewrite would bypass the Webpack alias.
declare module '@company-data' {
  export const privatePreview: boolean;
  export function getCompanyPreview(id: string): import('./lib/types').CompanyPreview | null;
  export function getCompanyStatus(id: string): import('./lib/types').CompanyStatus;
}
