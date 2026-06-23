import { redirect } from "next/navigation";

export default function LegacyDropRedirect({ params }: { params: { slug: string } }) {
  redirect(`/${params.slug}`);
}
