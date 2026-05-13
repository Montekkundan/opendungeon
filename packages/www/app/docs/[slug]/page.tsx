import { notFound } from "next/navigation";

import { DocsShell } from "@/components/docs/docs-shell";
import { getDoc, getStaticDocParams } from "@/lib/docs";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getStaticDocParams();
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const doc = await getDoc(slug);

  if (!doc) {
    return {
      title: "Docs | opendungeon",
    };
  }

  return {
    title: `${doc.title} | opendungeon docs`,
  };
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = await getDoc(slug);

  if (!doc) {
    notFound();
  }

  return (
    <DocsShell activeSlug={doc.slug} headings={doc.headings}>
      {doc.body}
    </DocsShell>
  );
}
