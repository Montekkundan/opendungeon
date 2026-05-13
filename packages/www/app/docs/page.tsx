import { DocsHashRedirect } from "@/components/docs/docs-hash-redirect";
import { DocsShell } from "@/components/docs/docs-shell";
import { defaultDocSlug, docHashRedirects, getDoc } from "@/lib/docs";

export const metadata = {
  title: "Docs | opendungeon",
};

export default async function DocsPage() {
  const doc = await getDoc(defaultDocSlug);

  if (!doc) {
    return null;
  }

  return (
    <>
      <DocsHashRedirect redirects={docHashRedirects} />
      <DocsShell activeSlug={doc.slug} headings={doc.headings}>
        {doc.body}
      </DocsShell>
    </>
  );
}
