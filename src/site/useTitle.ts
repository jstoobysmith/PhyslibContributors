import { useEffect } from 'react';
import { SITE } from '../lib/config';

/** Sets the browser tab title, e.g. "About · Physlib Contributions". */
export function useTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE.title}` : SITE.title;
  }, [title]);
}
