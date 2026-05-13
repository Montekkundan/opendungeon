import Link from "next/link";
import type { ReactNode } from "react";

import { Header } from "@/components/site-chrome";
import { type DocHeading, docGroups, docHref } from "@/lib/docs";

interface DocsShellProps {
  activeSlug?: string;
  children: ReactNode;
  headings: DocHeading[];
}

export function DocsShell({ activeSlug, children, headings }: DocsShellProps) {
  return (
    <main data-page="docs-shell">
      <div data-component="docs-container">
        <Header />
        <div data-component="docs-layout">
          <aside aria-label="Docs sections" data-component="docs-sidebar">
            {docGroups.map((group) => (
              <nav key={group.title}>
                <p>{group.title}</p>
                {group.items.map((item) => (
                  <Link
                    data-active={item.slug === activeSlug || undefined}
                    href={docHref(item.slug)}
                    key={item.slug}
                  >
                    {item.title}
                  </Link>
                ))}
              </nav>
            ))}
          </aside>

          <article data-component="docs-article">{children}</article>

          <aside aria-label="On this page" data-component="docs-toc">
            <nav>
              <p>On This Page</p>
              {headings.map((heading) => (
                <a
                  data-depth={heading.depth}
                  href={heading.href}
                  key={heading.href}
                >
                  {heading.title}
                </a>
              ))}
            </nav>
          </aside>
        </div>
      </div>
    </main>
  );
}
