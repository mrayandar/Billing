import Link from "next/link";

export default function NotAllowedPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8">
      <main className="card flex w-full max-w-[420px] flex-col gap-3 p-6">
        <h1 className="text-lg font-semibold">Not allowed</h1>
        <p className="text-sm text-muted">Your role does not have permission to open that page. Ask the owner if you need it.</p>
        <Link href="/" className="btn btn-primary">Back to the home page</Link>
      </main>
    </div>
  );
}
