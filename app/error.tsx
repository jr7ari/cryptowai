'use client';

import { useEffect } from 'react';

/** Route-level error boundary: a rendering bug on one page must not take down the shell (kill switch stays reachable). */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('page render error', error.message);
  }, [error]);
  return (
    <div className="banner banner-error" role="alert">
      <div>
        <strong>This page failed to render.</strong> {error.message}
      </div>
      <button type="button" className="btn btn-sm" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
