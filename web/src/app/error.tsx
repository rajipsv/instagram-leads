"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const db = /DATABASE_URL|fetch failed|ENOTFOUND|connect/i.test(error.message);
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-md">
        <h1 className="font-mono text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-muted">
          {db ? "Couldn't reach the database. Check your connection and DATABASE_URL in .env." : "The page failed to load."}
        </p>
        <button onClick={reset} className="mt-4 cursor-pointer rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover dark:text-bg">Try again</button>
      </div>
    </main>
  );
}
