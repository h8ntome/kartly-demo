import Link from "next/link";
import { LinkButton } from "@/components/ui/Primitives";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[34rem] flex-col items-center px-4 py-16 text-center sm:px-6">
      <span className="text-4xl" aria-hidden="true">
        🧺
      </span>
      <h1 className="mt-4 font-display text-[1.9rem] leading-tight text-forest-950">
        Nothing on this shelf
      </h1>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-sage-600">
        That page is not part of Kartly. The basket, the catalogue and the shops are all still where
        you left them.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <LinkButton href="/">Back to home</LinkButton>
        <LinkButton href="/basket" variant="outline">
          Open my basket
        </LinkButton>
      </div>
      <Link
        href="/search"
        className="mt-4 text-[0.86rem] font-semibold text-forest-700 hover:underline"
      >
        Or search the catalogue →
      </Link>
    </div>
  );
}
