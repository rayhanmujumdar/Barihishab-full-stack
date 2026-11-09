import { LanguageToggle } from "@/components/app/language-toggle";
import { translator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

// Split layout for every public auth screen (design system §5 "Login screen").
// The locale comes from the /[lang] segment, so this whole shell — translated
// — is prerendered on the server for each language.
export default function AuthLayout({ children }: LayoutProps<"/[lang]">) {
  return (
    <div className="auth">
      <aside className="auth-brand">
        <div>
          <p className="wordmark">
            Bari
            <br />
            Hisab
          </p>
          <p className="brand-sub" lang="bn">
            বাড়ির হিসাব
          </p>
        </div>
        <BrandTags />
      </aside>
      <main className="auth-main">
        <div className="auth-top">
          <Toggle />
        </div>
        <div className="auth-panel">{children}</div>
      </main>
    </div>
  );
}

async function BrandTags() {
  const locale = await getLocale();
  const tr = translator(locale);
  return (
    <div className="brand-tags" lang={locale}>
      <span>{tr("brand.tag1")}</span>
      <span>{tr("brand.tag2")}</span>
      <span>{tr("brand.tag3")}</span>
    </div>
  );
}

async function Toggle() {
  const locale = await getLocale();
  return <LanguageToggle locale={locale} label={translator(locale)("lang.switchTo")} />;
}
