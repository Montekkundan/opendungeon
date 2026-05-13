import { Header } from "@/components/site-chrome";
import { getChangelog } from "@/lib/docs";

export const metadata = {
  title: "Changelog | opendungeon",
};

export default async function ChangelogPage() {
  const changelog = await getChangelog();

  return (
    <main data-page="docs-shell">
      <div data-component="docs-container">
        <Header />
        <div data-component="changelog-layout">
          <article data-component="docs-article">{changelog.body}</article>
          <aside aria-label="Changelog sections" data-component="docs-toc">
            <nav>
              <p>On This Page</p>
              {changelog.headings.map((heading) => (
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
