import { redirect } from "next/navigation";

export default function GeneratePage({ searchParams }: { searchParams: { job?: string } }) {
  if (searchParams.job) redirect(`/jobs/${searchParams.job}`);
  redirect("/");
}
