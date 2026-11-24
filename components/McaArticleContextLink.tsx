'use client';

import React, { Suspense, type ComponentPropsWithoutRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { publicDirectoryReturnHref } from './mca-public-directory-filters';
import { sitePath } from '@/lib/site-path';

const listPath = '/quanguo/pingtai/';
type Props = Omit<ComponentPropsWithoutRef<'a'>, 'href'> & { href: string; toDirectory?: boolean };

function ContextLink({ href, toDirectory, ...props }: Props) {
  const from = publicDirectoryReturnHref(useSearchParams()?.get('from') ?? null);
  const target = toDirectory ? from :
    from === listPath ? href : href + '?' + new URLSearchParams({ from }).toString();
  return <a {...props} href={sitePath(target)} />;
}

export function McaArticleContextLink({ href, toDirectory, ...props }: Props) {
  return <Suspense fallback={<a {...props} href={sitePath(href)} />}>
    <ContextLink {...props} href={href} toDirectory={toDirectory} />
  </Suspense>;
}
