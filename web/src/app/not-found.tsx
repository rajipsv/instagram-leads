import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <h1 className="font-mono text-xl font-semibold">Not found</h1>
        <p className="mt-2 text-muted">That business or page doesn't exist. It may not be saved to the database yet.</p>
        <Link href="/" className="mt-4 inline-block cursor-pointer rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover dark:text-bg">All businesses</Link>
      </div>
    </main>
  );
}
