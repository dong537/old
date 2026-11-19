import { notFound } from 'next/navigation';
import { InstitutionReferenceProvincePage } from '@/components/InstitutionReferenceProvincePage';
import { getReferenceProvincePage, getReferenceProvinceRouteParams } from '@/lib/institution-reference-static';

export const dynamicParams = false;

export function generateStaticParams() {
  return getReferenceProvinceRouteParams();
}

export default async function ReferenceProvinceStaticPage({ params }: { params: Promise<{ province: string; pagination?: string[] }> }) {
  const { province, pagination = [] } = await params;
  let page = 1;
  if (pagination.length > 0) {
    if (pagination.length !== 2 || pagination[0] !== 'page' || !/^[1-9]\d*$/.test(pagination[1])) notFound();
    page = Number(pagination[1]);
    if (!Number.isSafeInteger(page)) notFound();
  }
  const data = getReferenceProvincePage(province, page);
  if (!data) notFound();
  return <InstitutionReferenceProvincePage data={data} />;
}
