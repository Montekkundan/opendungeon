import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme-switcher";

export const GITHUB_REPO_URL = "https://github.com/Montekkundan/opendungeon";

export function Header() {
  return (
    <header data-component="top">
      <Link aria-label="opendungeon home" data-component="brand" href="/">
        <span data-slot="wordmark">opendungeon</span>
      </Link>
      <div data-component="top-actions">
        <nav data-component="nav-desktop">
          <Link href="/docs">Docs</Link>
          <Link href="/changelog">Changelog</Link>
          <Link href="/create">Create</Link>
          <Link href="/gm">GM</Link>
          <Link href="/profile">Profile</Link>
          <a
            aria-label="Open opendungeon on GitHub"
            href={GITHUB_REPO_URL}
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
        </nav>
        <ThemeSwitcher />
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer data-component="footer">
      <Link href="/">opendungeon</Link>
      <nav>
        <Link href="/docs">Docs</Link>
        <Link href="/changelog">Changelog</Link>
        <Link href="/create">Create</Link>
        <Link href="/gm">GM</Link>
        <a
          aria-label="Open opendungeon on GitHub"
          href={GITHUB_REPO_URL}
          rel="noreferrer"
          target="_blank"
        >
          GitHub
        </a>
      </nav>
    </footer>
  );
}
