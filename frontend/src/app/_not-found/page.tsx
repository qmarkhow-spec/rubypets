export const runtime = "edge";
//
export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="text-sm text-slate-500">
        The page you are looking for does not exist.
      </p>
      <a
        href="/"
        className="rounded-full bg-slate-900 px-5 py-2 text-sm text-white hover:bg-slate-800"
      >
        Back to home
      </a>
    </div>
  );
}
