import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function TypoCreateRedirect({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const suffix = new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) =>
      value ? [[key, value]] : []
    )
  ).toString();
  redirect(`/create/${id}${suffix ? `?${suffix}` : ""}`);
}
