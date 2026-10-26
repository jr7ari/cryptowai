import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="empty">
      <div className="empty-title">Page not found</div>
      <div className="empty-body">
        <Link href="/">Back to overview</Link>
      </div>
    </div>
  );
}
