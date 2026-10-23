import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, ChevronDown, Loader2, Package, RotateCw, Search, X } from "lucide-react";
import catalogRepository, { subscribeCatalogRegister } from "../../services/catalogRepository";
import useAdminProductSearch from "../../hooks/useAdminProductSearch";
import { AtelierButton } from "../../design-system";
import StatusBadge from "../employee/StatusBadge";
import { getProductStatusLabel } from "../../config/productCatalogConfig";
import PratikshyaImage from "../PratikshyaImage";
import { imageRef } from "../../data/mediaPlaceholder";
import { cn } from "../../utils/cn";

/**
 * PRATIKSHYA FASHION — product picker for product-media upload.
 *
 * TWO SOURCES, ONE CONTRACT
 *
 *   productSource="admin-search" (default)
 *     The admin catalogue endpoint through `useAdminProductSearch`: debounced
 *     server search over the WHOLE catalogue, paged, with an explicit
 *     loading / empty / error+retry state. This is what fixes a cold page
 *     showing an empty list and an older product being unsearchable.
 *
 *   productSource="register"
 *     The employee portal, which has NO product-list endpoint. It reads the
 *     shared register reactively and says so plainly when the register is
 *     empty. It does not pretend the gap is closed.
 *
 * HONESTY
 *   · the SKU shown is the product's real SKU, or "SKU unavailable" — a
 *     fabricated identifier must never be displayed as if it were real;
 *   · every row carries the product's workflow status, so an ARCHIVED product
 *     is visible as such BEFORE media is added to it.
 *
 * ACCESSIBILITY
 *   A real combobox: role/aria-expanded/aria-controls/aria-activedescendant,
 *   Arrow/Home/End/Enter/Escape/Tab, outside-click dismissal, an announced
 *   result count and `aria-invalid` on error. Options are reached by keyboard
 *   only through focus on the input (roving `aria-selected`), which is the
 *   WAI-ARIA pattern for a listbox popup.
 */

const STATUS_TONE = {
  PUBLISHED: "ink",
  PENDING_REVIEW: "alert",
  DRAFT: "quiet",
  ARCHIVED: "muted",
};

const rowOf = (product) => ({
  id: product?.id ?? "",
  name: product?.name || "Untitled product",
  sku: product?.sku ? String(product.sku) : "",
  category: product?.category || "",
  subcategory: product?.subcategory || "",
  status: product?.status || null,
  price: Number.isFinite(Number(product?.price)) ? Number(product.price) : null,
  image: product?.image && typeof product.image === "object" ? product.image : imageRef(product?.image),
});

function StatusChip({ status }) {
  if (!status) return null;
  return (
    <StatusBadge
      label={getProductStatusLabel(status)}
      tone={STATUS_TONE[status] ?? "quiet"}
      className="!px-2 !py-0.5 !text-[9px]"
    />
  );
}

function ProductRow({ row, active, selected, onSelect, onHover, id }) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onMouseDown={(event) => {
        /* keep focus on the combobox input while selecting */
        event.preventDefault();
        onSelect(row);
      }}
      onMouseEnter={onHover}
      className={cn(
        "flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 transition-colors",
        active ? "bg-surface" : "hover:bg-surface/70",
        selected && "bg-surface/60"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-10 w-9 shrink-0 overflow-hidden border border-mist/70 bg-canvas-deep">
          <PratikshyaImage image={row.image} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-ui text-xs font-medium text-ink">{row.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 font-ui text-[10px] text-taupe">
            {row.sku ? (
              <span className="font-mono text-[10px] uppercase text-cocoa">{row.sku}</span>
            ) : (
              <span className="italic">SKU unavailable</span>
            )}
            {row.category ? <span className="capitalize">· {row.category}</span> : null}
            {row.status ? <StatusChip status={row.status} /> : null}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {row.price != null ? (
          <span className="font-mono font-ui text-[11px] text-cocoa">
            ₹{row.price.toLocaleString("en-IN")}
          </span>
        ) : null}
        {selected ? <Check size={14} className="text-accent" aria-hidden="true" /> : null}
      </div>
    </li>
  );
}

export default function MediaProductSelector({
  selectedProductId,
  onSelectProduct,
  disabled = false,
  error = null,
  required = true,
  productSource = "admin-search",
  selectedRecord = null,
  label = "Assigned Product",
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [registerVersion, setRegisterVersion] = useState(0);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listboxId = useId();
  const inputId = "product-search-input";

  const isServerSource = productSource === "admin-search";
  const search = useAdminProductSearch({ enabled: isServerSource });

  /* Employee register source — reactive, no fetch. */
  useEffect(() => {
    if (isServerSource) return undefined;
    return subscribeCatalogRegister(() => setRegisterVersion((value) => value + 1));
  }, [isServerSource]);

  const registerRows = useMemo(() => {
    if (isServerSource) return [];
    void registerVersion; // recompute when the register changes
    return (catalogRepository.all() ?? []).map(rowOf);
  }, [isServerSource, registerVersion]);

  const rows = useMemo(() => {
    if (isServerSource) return (search.items ?? []).map(rowOf);
    const term = query.trim().toLowerCase();
    if (!term) return registerRows.slice(0, 20);
    return registerRows
      .filter((row) =>
        [row.name, row.sku, row.category, row.subcategory, row.id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term)
      )
      .slice(0, 20);
  }, [isServerSource, query, registerRows, search.items]);

  const selectedProduct = useMemo(() => {
    if (selectedRecord) return rowOf(selectedRecord);
    if (!selectedProductId) return null;
    const fromRows = rows.find((row) => String(row.id) === String(selectedProductId));
    if (fromRows) return fromRows;
    const cached = catalogRepository.find(selectedProductId);
    if (cached) return rowOf(cached);
    /* Last resort: the id is real (the API accepted it) but the record is not
       in any source we can read — show the id rather than invent a name. */
    return { id: String(selectedProductId), name: String(selectedProductId), sku: "", category: "", subcategory: "", status: null, price: null, image: null };
  }, [rows, selectedProductId, selectedRecord]);

  /* Outside click + Escape close the popup (MEDIA-UPLOAD-026). */
  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [isOpen]);

  /* Keep the active option visible while arrowing through a long list. */
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    if (typeof document === "undefined") return;
    document.getElementById(`${listboxId}-option-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, isOpen, listboxId]);

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  const choose = useCallback(
    (row) => {
      onSelectProduct?.(row.id, row);
      setIsOpen(false);
      setActiveIndex(-1);
      setQuery("");
    },
    [onSelectProduct]
  );

  const handleClear = () => {
    onSelectProduct?.(null, null);
    setQuery("");
    setIsOpen(true);
    setActiveIndex(-1);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (event) => {
    const count = rows.length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) setIsOpen(true);
      setActiveIndex((current) => (count ? (current + 1) % count : -1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) setIsOpen(true);
      setActiveIndex((current) => (count ? (current <= 0 ? count - 1 : current - 1) : -1));
      return;
    }
    if (event.key === "Home" && isOpen) {
      event.preventDefault();
      setActiveIndex(count ? 0 : -1);
      return;
    }
    if (event.key === "End" && isOpen) {
      event.preventDefault();
      setActiveIndex(count ? count - 1 : -1);
      return;
    }
    if (event.key === "Enter") {
      if (isOpen && activeIndex >= 0 && rows[activeIndex]) {
        event.preventDefault();
        choose(rows[activeIndex]);
      } else if (!isOpen) {
        setIsOpen(true);
      }
      return;
    }
    if (event.key === "Escape") {
      if (isOpen) {
        event.preventDefault();
        close();
      }
      return;
    }
    if (event.key === "Tab") close();
  };

  const searchState = isServerSource ? search.status : "ready";
  const showSearchError = isServerSource && searchState === "error";
  const isLoading = isServerSource && searchState === "loading" && rows.length === 0;
  const total = isServerSource ? search.total : registerRows.length;
  const hasMore = isServerSource ? search.hasMore : false;
  const activeOptionId =
    isOpen && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {selectedProduct ? (
          <p className="font-ui text-[11px] uppercase tracking-[.18em] text-taupe">
            {label} {required ? <span className="text-accent">*</span> : ""}
          </p>
        ) : (
          <label
            className="font-ui text-[11px] uppercase tracking-[.18em] text-taupe"
            htmlFor={inputId}
          >
            {label} {required ? <span className="text-accent">*</span> : ""}
          </label>
        )}
        {selectedProduct ? (
          <span className="inline-flex items-center gap-1 font-ui text-[10px] text-pf-success">
            <CheckCircle2 size={12} aria-hidden="true" />
            Product selected
          </span>
        ) : (
          <span className="font-ui text-[10px] text-taupe">Search by name or SKU</span>
        )}
      </div>

      {selectedProduct ? (
        <div className="flex flex-col gap-3 border border-mist bg-surface/50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-14 w-12 shrink-0 overflow-hidden border border-mist bg-canvas-deep">
              <PratikshyaImage
                image={selectedProduct.image}
                alt={selectedProduct.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="truncate font-display text-sm font-medium text-ink">
                {selectedProduct.name}
              </p>
              <p className="flex flex-wrap items-center gap-1.5 font-ui text-[11px] text-taupe">
                {selectedProduct.sku ? (
                  <span className="font-mono text-[10px] uppercase text-cocoa">{selectedProduct.sku}</span>
                ) : (
                  <span className="italic">SKU unavailable</span>
                )}
                {selectedProduct.category ? (
                  <span className="capitalize">· {selectedProduct.category}</span>
                ) : null}
                {selectedProduct.subcategory ? <span>· {selectedProduct.subcategory}</span> : null}
                <StatusChip status={selectedProduct.status} />
              </p>
              {selectedProduct.status === "ARCHIVED" ? (
                <p className="font-ui text-[11px] leading-relaxed text-pf-warning" role="status">
                  Archived product — media added here will not appear on the storefront. Nothing
                  is deleted; the product is simply retired.
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
            <AtelierButton
              type="button"
              size="chip"
              variant="outline"
              disabled={disabled}
              onClick={handleClear}
              className="text-taupe hover:text-ink"
            >
              Change Product
            </AtelierButton>
          </div>
        </div>
      ) : (
        <div className="relative" ref={containerRef}>
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-3 text-taupe"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={activeOptionId}
              aria-invalid={error ? true : undefined}
              aria-busy={isLoading || undefined}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(-1);
                if (!isOpen) setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search product name or SKU…"
              disabled={disabled}
              autoComplete="off"
              className={cn(
                "w-full border bg-canvas py-2.5 pl-9 pr-20 font-ui text-sm text-ink outline-none transition-colors focus:border-accent",
                error ? "border-accent" : "border-mist",
                disabled && "opacity-50"
              )}
            />
            {isLoading ? (
              <Loader2
                size={14}
                className="absolute right-9 top-3 animate-spin text-taupe"
                aria-hidden="true"
              />
            ) : query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search query"
                className="absolute right-9 top-3 text-taupe hover:text-ink"
              >
                <X size={14} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => (isOpen ? close() : setIsOpen(true))}
              aria-label={isOpen ? "Close product list" : "Open product list"}
              aria-expanded={isOpen}
              aria-controls={listboxId}
              className="absolute right-3 top-3 text-taupe hover:text-ink"
            >
              <ChevronDown size={16} className={cn("transition-transform", isOpen && "rotate-180")} />
            </button>
          </div>

          {/* Announced result count — screen readers hear the list change. */}
          <p className="sr-only" role="status" aria-live="polite">
            {isOpen
              ? isLoading
                ? "Loading products"
                : `${rows.length} product${rows.length === 1 ? "" : "s"} shown${
                    total != null ? ` of ${total}` : ""
                  }`
              : ""}
          </p>

          {isOpen ? (
            <div className="absolute z-30 mt-1 w-full border border-mist bg-canvas shadow-lg">
              {showSearchError ? (
                <div className="p-4 text-center" role="alert">
                  <p className="font-ui text-xs text-accent">
                    {search.error ?? "The product catalogue could not be loaded."}
                  </p>
                  <AtelierButton
                    type="button"
                    size="chip"
                    variant="outline"
                    className="mt-2"
                    onClick={search.retry}
                  >
                    <RotateCw size={12} className="mr-1 inline-block" /> Try again
                  </AtelierButton>
                </div>
              ) : isLoading ? (
                <div className="flex items-center justify-center gap-2 p-4 font-ui text-xs text-taupe">
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Searching the catalogue…
                </div>
              ) : rows.length ? (
                <>
                  <ul
                    id={listboxId}
                    role="listbox"
                    aria-label="Products"
                    className="max-h-64 divide-y divide-mist/60 overflow-y-auto"
                  >
                    {rows.map((row, index) => (
                      <ProductRow
                        key={row.id}
                        id={`${listboxId}-option-${index}`}
                        row={row}
                        active={index === activeIndex}
                        selected={String(row.id) === String(selectedProductId)}
                        onSelect={choose}
                        onHover={() => setActiveIndex(index)}
                      />
                    ))}
                  </ul>
                  <div className="flex items-center justify-between gap-2 border-t border-mist/70 px-3 py-2">
                    <span className="font-ui text-[10px] text-taupe">
                      {total != null ? `${rows.length} of ${total}` : `${rows.length} shown`}
                    </span>
                    {hasMore ? (
                      <button
                        type="button"
                        onClick={() => search.loadMore()}
                        disabled={search.isLoading}
                        className="font-ui text-[10px] uppercase tracking-wider text-cocoa underline-offset-4 hover:text-accent hover:underline disabled:opacity-50"
                      >
                        {search.isLoading ? "Loading…" : "Load more"}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="p-4 text-center">
                  <Package size={18} className="mx-auto text-taupe" aria-hidden="true" />
                  <p className="mt-1 font-ui text-xs text-taupe">
                    {isServerSource
                      ? query
                        ? <>No products found matching &ldquo;{query}&rdquo;</>
                        : "No products in the catalogue yet"
                      : registerRows.length
                        ? <>No products found matching &ldquo;{query}&rdquo;</>
                        : "No products are available in this portal"}
                  </p>
                  {!isServerSource && !registerRows.length ? (
                    <p className="mx-auto mt-2 max-w-xs font-ui text-[11px] leading-relaxed text-taupe">
                      The employee portal has no catalogue list. Open this page from a product&rsquo;s
                      media desk so the product context is supplied, or ask an administrator to add
                      the media.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {error ? (
        <p className="font-ui text-[11px] text-accent" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
