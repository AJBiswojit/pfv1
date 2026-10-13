import { NavLink, useLocation } from "react-router-dom";
import { cn } from "../../utils/cn";

export const ANALYTICS_TABS = [
  { id: "overview", label: "Overview", section: "overview", path: "", employeePath: "" },
  { id: "sales", label: "Sales", section: "sales", path: "/sales", employeePath: "/sales" },
  { id: "products", label: "Products", section: "products", path: "/products", employeePath: "/products" },
  { id: "customers", label: "Customers", section: "customers", path: "/customers", employeePath: "/customers" },
  { id: "inventory", label: "Inventory", section: "inventory", path: "/inventory", employeePath: "/inventory" },
  { id: "returns", label: "Returns", section: "returns", path: "/returns", employeePath: "/returns" },
  { id: "offers", label: "Offers", section: "offers", path: "/offers", employeePath: "/offers" },
  { id: "employees", label: "Employees", section: "employees", path: "/employees", employeePath: "/employees" },
];

/**
 * Derives the analytics base URL from the current pathname so tab links
 * always resolve under the correct portal prefix (/admin, /super-admin, or
 * /employee/reports) regardless of how the component is mounted.
 */
function useAnalyticsBase(portal) {
  const { pathname } = useLocation();
  if (portal === "employee") return "/employee/reports";
  if (pathname.startsWith("/super-admin")) return "/super-admin/analytics";
  return "/admin/analytics";
}

export default function AnalyticsNav({ portal = "admin", tabs = ANALYTICS_TABS }) {
  const base = useAnalyticsBase(portal);

  return (
    <nav aria-label="Analytics sections" className="-mx-1 mb-6 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-mist/80 px-1">
        {tabs.map((tab) => {
          const tabPath = portal === "employee" ? tab.employeePath : tab.path;
          const to = `${base}${tabPath}`;
          return (
            <li key={tab.id}>
              <NavLink
                to={to}
                end={tab.id === "overview"}
                className={({ isActive }) =>
                  cn(
                    "inline-flex px-3 py-2.5 font-ui text-[11px] uppercase tracking-[.14em] transition-colors",
                    isActive
                      ? "border-b-2 border-ink text-ink"
                      : "border-b-2 border-transparent text-taupe hover:text-ink"
                  )
                }
              >
                {tab.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
