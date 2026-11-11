import { redirect } from "next/navigation";
import { localePath } from "@/lib/i18n/paths";
import { getLocale } from "@/lib/i18n/server";

/** `/reports` opens the Monthly tab (Reports PRD F1; main PRD S9). */
export default async function ReportsIndex() {
  redirect(localePath(await getLocale(), "/reports/monthly"));
}
