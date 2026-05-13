import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";

export const defaultDocSlug = "introduction";

export interface DocNavItem {
  slug: string;
  title: string;
}

export const docGroups: ReadonlyArray<{
  items: readonly DocNavItem[];
  title: string;
}> = [
  {
    items: [
      { slug: "introduction", title: "Introduction" },
      { slug: "installation", title: "Installation" },
      { slug: "game-mechanics", title: "Game mechanics" },
      { slug: "controls", title: "Controls" },
      { slug: "multiplayer", title: "Multiplayer" },
      { slug: "supabase", title: "Supabase" },
      { slug: "deployment", title: "Deployment" },
    ],
    title: "Sections",
  },
  {
    items: [
      { slug: "core-loop", title: "Core loop" },
      { slug: "combat-mechanics", title: "Combat mechanics" },
      { slug: "npc-types", title: "NPC types" },
      { slug: "monster-types", title: "Monster types" },
      {
        slug: "village-and-meta-progression",
        title: "Village and meta-progression",
      },
      { slug: "cloud-and-ai-admin", title: "Cloud and AI admin" },
    ],
    title: "Game systems",
  },
] as const;

export type DocSlug = string;

export interface DocHeading {
  depth: number;
  href: string;
  title: string;
}

interface DocRecord {
  body: ReactNode;
  headings: DocHeading[];
  slug: string;
  title: string;
}

const docsDirectory = join(process.cwd(), "content", "docs");
const changelogPath = join(process.cwd(), "..", "..", "CHANGELOG.md");
const changesetDirectory = join(process.cwd(), "..", "..", ".changeset");
const anyHeadingPattern = /^(#{1,3})\s+(.+)$/;
const docHeadingPattern = /^(#{2,3})\s+(.+)$/;
const edgeDashPattern = /^-|-$/g;
const frontmatterPattern = /^---[\s\S]*?---\s*/;
const inlinePattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
const markdownLinkPattern = /^\[([^\]]+)\]\(([^)]+)\)$/;
const newlinePattern = /\n+/g;
const nonAlnumPattern = /[^a-z0-9]+/g;
const titlePattern = /^#\s+(.+)$/m;
const topLevelHeadingPattern = /^# .+\n+/;

export const docHashRedirects = Object.fromEntries(
  docGroups.flatMap((group) =>
    group.items.map((item) => [`#${item.slug}`, docHref(item.slug)])
  )
);

export function docHref(slug: string) {
  return slug === defaultDocSlug ? "/docs" : `/docs/${slug}`;
}

export function getDocNavItems() {
  return docGroups.flatMap((group) => group.items);
}

export function isDocSlug(value: string) {
  return getDocNavItems().some((item) => item.slug === value);
}

export async function getDoc(slug: string): Promise<DocRecord | undefined> {
  if (!isDocSlug(slug)) {
    return;
  }

  const markdown = await readFile(join(docsDirectory, `${slug}.md`), "utf8");
  return {
    body: renderMarkdown(markdown),
    headings: extractHeadings(markdown),
    slug,
    title: extractTitle(markdown) ?? titleForSlug(slug),
  };
}

export async function getChangelog() {
  const [published, pending] = await Promise.all([
    readFile(changelogPath, "utf8"),
    readPendingChangesets(),
  ]);
  const markdown = [
    "# Changelog",
    "",
    "Release notes generated through Changesets for the terminal package and the website work attached to it.",
    "",
    ...pending,
    stripTopLevelHeading(published),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    body: renderMarkdown(markdown),
    headings: extractHeadings(markdown),
    title: "Changelog",
  };
}

export function getStaticDocParams() {
  return getDocNavItems()
    .filter((item) => item.slug !== defaultDocSlug)
    .map((item) => ({ slug: item.slug }));
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(nonAlnumPattern, "-")
    .replace(edgeDashPattern, "");
}

async function readPendingChangesets() {
  const files = await readdir(changesetDirectory);
  const notes = await Promise.all(
    files
      .filter((file) => file.endsWith(".md"))
      .map(async (file) => {
        const markdown = await readFile(join(changesetDirectory, file), "utf8");
        return markdown.replace(frontmatterPattern, "").trim();
      })
  );
  const filtered = notes.filter(Boolean);

  if (filtered.length === 0) {
    return [];
  }

  return [
    "## Pending changes",
    "",
    ...filtered.flatMap((note) => [
      `- ${note.replace(newlinePattern, " ")}`,
      "",
    ]),
  ];
}

function stripTopLevelHeading(markdown: string) {
  return markdown.replace(topLevelHeadingPattern, "");
}

function extractTitle(markdown: string) {
  const match = markdown.match(titlePattern);
  return match?.[1];
}

function titleForSlug(slug: string) {
  return getDocNavItems().find((item) => item.slug === slug)?.title ?? slug;
}

function extractHeadings(markdown: string): DocHeading[] {
  const seen = new Map<string, number>();
  return markdown.split("\n").flatMap((line) => {
    const match = line.match(docHeadingPattern);
    if (!match) {
      return [];
    }
    const title = match[2].trim();
    return [
      {
        depth: match[1].length,
        href: `#${uniqueSlug(title, seen)}`,
        title,
      },
    ];
  });
}

function renderMarkdown(markdown: string) {
  const lines = markdown.split("\n");
  const blocks: ReactNode[] = [];
  const headingSlugs = new Map<string, number>();
  let paragraph: string[] = [];
  let index = 0;

  function flushParagraph() {
    if (paragraph.length === 0) {
      return;
    }
    const text = paragraph.join(" ").trim();
    paragraph = [];
    if (text) {
      blocks.push(<p key={`p-${blocks.length}`}>{renderInline(text)}</p>);
    }
  }

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      flushParagraph();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push(renderCodeBlock(code, blocks.length));
      index += 1;
      continue;
    }

    const heading = trimmed.match(anyHeadingPattern);
    if (heading) {
      flushParagraph();
      const depth = heading[1].length;
      const text = heading[2].trim();
      const id = depth > 1 ? uniqueSlug(text, headingSlugs) : undefined;
      const HeadingTag = `h${depth}` as "h1" | "h2" | "h3";
      blocks.push(
        <HeadingTag id={id} key={`h-${blocks.length}`}>
          {renderInline(text)}
        </HeadingTag>
      );
      index += 1;
      continue;
    }

    if (trimmed.startsWith("- ")) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        items.push(lines[index].trim().slice(2));
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`}>
          {items.map((item) => (
            <li key={item}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

function renderCodeBlock(lines: string[], key: number) {
  const seen = new Map<string, number>();
  const rows = lines.map((line, lineIndex) => ({
    id: codeLineId(key, line, seen),
    line,
    number: lineIndex + 1,
  }));

  return (
    <div data-component="docs-code-panel" key={`code-${key}`}>
      {rows.map((row) => (
        <div data-slot="code-row" key={row.id}>
          <span>{row.number}</span>
          <code>{row.line || " "}</code>
        </div>
      ))}
    </div>
  );
}

function renderInline(text: string) {
  const pieces: ReactNode[] = [];
  let cursor = 0;
  inlinePattern.lastIndex = 0;
  let match = inlinePattern.exec(text);

  while (match) {
    if (match.index > cursor) {
      pieces.push(text.slice(cursor, match.index));
    }

    const value = match[0];
    if (value.startsWith("`")) {
      pieces.push(
        <code key={`${value}-${match.index}`}>{value.slice(1, -1)}</code>
      );
    } else {
      const link = value.match(markdownLinkPattern);
      if (link) {
        pieces.push(
          <a href={link[2]} key={`${link[2]}-${match.index}`}>
            {link[1]}
          </a>
        );
      }
    }

    cursor = match.index + value.length;
    match = inlinePattern.exec(text);
  }

  if (cursor < text.length) {
    pieces.push(text.slice(cursor));
  }

  return pieces;
}

function codeLineId(blockKey: number, line: string, seen: Map<string, number>) {
  const count = seen.get(line) ?? 0;
  seen.set(line, count + 1);
  return `${blockKey}-${slugify(line) || "blank"}-${count}`;
}

function uniqueSlug(value: string, seen: Map<string, number>) {
  const base = slugify(value);
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}
