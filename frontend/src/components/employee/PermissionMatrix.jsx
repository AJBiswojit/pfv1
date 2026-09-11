import { PERMISSION_CATALOGUE } from "../../config/employeePermissions";
import { cn } from "../../utils/cn";

/**
 * The single assignment matrix — reused for both permission vocabularies:
 * the employee portal's operational PERMISSION_CATALOGUE (default) and the
 * unified capability groups (CAPABILITY_GROUPS from config/rbacModel, passed
 * via `catalogue`). Same rows, same switches, same design language.
 *
 * `ceiling` (optional, array of codes) locks every row the current actor may
 * not delegate — the visual mirror of the server-side delegation check; the
 * server remains the authority.
 */
export default function PermissionMatrix({
  permissions = [],
  editable = false,
  onToggle,
  className = "",
  catalogue = null,
  ceiling = null,
}) {
  const allowed = new Set(permissions);
  const locked = ceiling ? new Set(ceiling) : null;
  const groups = (catalogue ?? PERMISSION_CATALOGUE).map((group) => ({
    key: group.group ?? group.id,
    label: group.label ?? group.group ?? group.id,
    items: group.items ?? (group.actions ?? []).map((action) => ({ key: action.code, label: action.label })),
  }));

  return (
    <div className={cn("space-y-6", className)}>
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`perm-${group.key}`}>
          <h3
            id={`perm-${group.key}`}
            className="mb-3 font-ui text-[10px] uppercase tracking-[.2em] text-brass"
          >
            {group.label}
          </h3>
          <ul className="divide-y divide-mist/70 border border-mist/80 bg-canvas/60">
            {group.items.map((item) => {
              const isOn = allowed.has(item.key);
              const isLocked = locked ? !locked.has(item.key) : false;
              return (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <span className="font-ui text-sm text-ink">{item.label}</span>
                  {editable ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isOn}
                      disabled={isLocked}
                      title={isLocked ? "Outside your own delegated authority" : undefined}
                      aria-label={`${item.label}: ${isOn ? "allowed" : "not allowed"}`}
                      onClick={() => onToggle?.(item.key, !isOn)}
                      className={cn(
                        "min-w-[4.5rem] border px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.16em] transition-colors",
                        isLocked && "cursor-not-allowed opacity-40",
                        isOn
                          ? "border-ink bg-ink text-ivory"
                          : "border-pearl bg-canvas text-taupe hover:border-ink hover:text-ink"
                      )}
                    >
                      {isOn ? "Allowed" : "No"}
                    </button>
                  ) : (
                    <span
                      className={cn(
                        "font-ui text-[10px] uppercase tracking-[.16em]",
                        isOn ? "text-cocoa" : "text-taupe"
                      )}
                    >
                      {isOn ? "Allowed" : "No"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
