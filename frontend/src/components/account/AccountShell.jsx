import { AtelierSection, Breadcrumb } from "../../design-system";
import { useCustomerStorefront } from "../../config/customerRoutes";
import AccountHero from "./AccountHero";
import AccountNav from "./AccountNav";

/**
 * Common layout frame for all customer account pages.
 *
 * In the Atelier storefront, `AccountShell` owns the page's primary `<main>`
 * landmark. When a production account page is mounted inside `CustomerStorefront`,
 * the outer `Layout` (`components/customer/components/layout/Layout.jsx`) already
 * provides `<main id="main">`, so `AccountShell` omits the inner `<main>` to
 * avoid nested main landmarks.
 */
export default function AccountShell({
  breadcrumbItems = [{ label: "Account" }],
  children,
}) {
  const storefront = useCustomerStorefront();
  const fullBreadcrumbs = [
    { label: "Atelier", to: "/" },
    ...breadcrumbItems,
  ];

  const section = (
    <AtelierSection rhythm="none" width="wide" className="pb-24 pt-28 sm:pt-32 md:pb-32">
      <Breadcrumb items={fullBreadcrumbs} className="mb-6 md:mb-8" />
      <AccountHero />
      <AccountNav className="mb-8 md:mb-10" />
      {children}
    </AtelierSection>
  );

  return storefront ? section : <main>{section}</main>;
}
