import { redirect } from "next/navigation";
import { localePath } from "@/lib/i18n/paths";
import { getLocale } from "@/lib/i18n/server";

/** `/complaints/{id}` (main PRD S10; email links) opens the complaint drawer on Notices. */
export default async function ComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(localePath(await getLocale(), `/notices?complaint=${encodeURIComponent(id)}`));
}
