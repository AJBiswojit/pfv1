/**
 * PRATIKSHYA FASHION — Product editor sections: Basic Information and
 * Category & Attributes (Phase 13).
 *
 * Basics holds identity + taxonomy only. Story copy lives in Product Content;
 * cover/gallery live in Media. Collection membership is assigned from the
 * collection desk, not from this form.
 */

import { useMemo } from "react";
import {
  AVAILABILITY_OPTIONS,
  COLOR_OPTIONS,
  DEPARTMENT_SELECT_OPTIONS,
  FABRIC_OPTIONS,
  GENDER_OPTIONS,
  MATERIAL_OPTIONS,
  OCCASION_OPTIONS,
  PATTERN_OPTIONS,
  PRODUCT_TYPES,
  SEASON_OPTIONS,
  SIZE_OPTIONS,
  TAG_SUGGESTIONS,
  WORK_OPTIONS,
  departmentCategoriesFor,
} from "../../config/productCatalogConfig";
import catalogRepository from "../../services/catalogRepository";
import { resolveTaxonomySelectValue } from "../../services/taxonomyLifecycle";
import { departmentForCategory } from "../../data/products/departments";
import { useAssignableCategoryOptions, useAssignableSubcategories } from "../../hooks/useAssignableTaxonomy";
import {
  ChipGroup,
  ChipRadio,
  Field,
  Select,
  TagInput,
  TextInput,
  hintClass,
} from "./editorFields";

/* ------------------------------------------------------------------ */
/* Taxonomy + name — shared by the full editor and Quick Create        */
/* ------------------------------------------------------------------ */

export function ProductTaxonomyFields({ draft, patch, errors = {}, isNew, nameId = "pf-name" }) {
  const allCategories = useAssignableCategoryOptions();
  const subcategoryItems = useAssignableSubcategories(draft.category);

  const categoryOptions = useMemo(() => {
    if (!draft.department) return allCategories;
    const allowed = new Set(departmentCategoriesFor(draft.department).map((entry) => entry.value));
    const filtered = allCategories.filter((category) => allowed.has(category.id));
    return filtered.length ? filtered : allCategories;
  }, [allCategories, draft.department]);

  const handleDepartmentChange = (departmentId) => {
    patch({ department: departmentId, category: "", subcategory: "" });
  };

  const handleCategoryChange = (categoryId) => {
    const inferred = departmentForCategory(categoryId);
    patch({
      category: categoryId,
      subcategory: "",
      department: inferred || draft.department,
    });
  };

  return (
    <>
      <Field
        label="Department"
        hint={
          isNew
            ? "Narrows the category list. The Product ID is allocated from the category you save."
            : "Department is locked after the canonical Product ID is allocated."
        }
        htmlFor="pf-department"
      >
        <Select
          id="pf-department"
          value={draft.department}
          onChange={(event) => handleDepartmentChange(event.target.value)}
          placeholder="Choose a department"
          disabled={!isNew}
          options={DEPARTMENT_SELECT_OPTIONS.map((dept) => ({
            value: dept.value ?? dept.id,
            label: dept.label,
          }))}
        />
      </Field>

      <Field label="Category" required error={errors.category} htmlFor="pf-category">
        <Select
          id="pf-category"
          value={resolveTaxonomySelectValue(categoryOptions, draft.category)}
          onChange={(event) => handleCategoryChange(event.target.value)}
          placeholder={draft.department ? "Choose a category" : "Choose a department first (or pick any category)"}
          disabled={!isNew}
          options={categoryOptions.map((category) => ({ value: category.id, label: category.label }))}
        />
      </Field>

      <Field label="Subcategory" htmlFor="pf-subcategory" className="lg:col-span-2">
        <Select
          id="pf-subcategory"
          value={resolveTaxonomySelectValue(subcategoryItems, draft.subcategory)}
          onChange={(event) => patch({ subcategory: event.target.value })}
          placeholder={draft.category ? "Choose a style" : "Choose a category first"}
          disabled={!isNew}
          options={subcategoryItems.map((entry) => ({ value: entry.id, label: entry.name }))}
        />
      </Field>

      <Field label="Product name" required error={errors.name} htmlFor={nameId} className="lg:col-span-2">
        <TextInput
          id={nameId}
          value={draft.name}
          onChange={(event) => patch({ name: event.target.value })}
          placeholder="Product name"
          autoComplete="off"
        />
      </Field>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 1 · Basic information                                               */
/* ------------------------------------------------------------------ */

export function SectionBasics({ draft, patch, errors, isNew }) {
  const slugPreview = draft.slug || catalogRepository.suggestSlug(draft.name, draft.id);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ProductTaxonomyFields draft={draft} patch={patch} errors={errors} isNew={isNew} />

      <Field
        label="SKU"
        error={errors.sku}
        hint="Leave blank to let the server allocate a unique SKU. Type one only to override."
        htmlFor="pf-sku"
      >
        <TextInput
          id="pf-sku"
          value={draft.sku}
          onChange={(event) => patch({ sku: event.target.value.toUpperCase() })}
          placeholder="Allocated on save"
          autoComplete="off"
        />
      </Field>

      <Field label="Brand" htmlFor="pf-brand">
        <TextInput
          id="pf-brand"
          value={draft.brand}
          onChange={(event) => patch({ brand: event.target.value })}
        />
      </Field>

      <Field label="Product type" hint="Used for merchandising and future AI classification." htmlFor="pf-type">
        <Select
          id="pf-type"
          value={draft.productType}
          onChange={(event) => patch({ productType: event.target.value })}
          options={PRODUCT_TYPES.map((type) => ({ value: type.id, label: type.label }))}
        />
      </Field>

      <Field label="Gender" htmlFor="pf-gender">
        <Select
          id="pf-gender"
          value={draft.gender}
          onChange={(event) => patch({ gender: event.target.value })}
          options={GENDER_OPTIONS.map((gender) => ({ value: gender, label: gender }))}
        />
      </Field>

      <Field label="Product code" htmlFor="pf-code">
        <TextInput
          id="pf-code"
          value={draft.productCode}
          onChange={(event) => patch({ productCode: event.target.value })}
          placeholder="Optional style code"
        />
      </Field>

      <Field label="Barcode" htmlFor="pf-barcode">
        <TextInput
          id="pf-barcode"
          value={draft.barcode}
          onChange={(event) => patch({ barcode: event.target.value })}
          placeholder="EAN / UPC"
        />
      </Field>

      <Field label="Internal reference" htmlFor="pf-ref">
        <TextInput
          id="pf-ref"
          value={draft.internalReference}
          onChange={(event) => patch({ internalReference: event.target.value })}
          placeholder="Supplier or loom reference"
        />
      </Field>

      <Field
        label="Product tags"
        hint="Searchable across the storefront."
        className="lg:col-span-2"
        htmlFor="pf-tags"
      >
        <TagInput
          value={draft.tags}
          onChange={(tags) => patch({ tags })}
          suggestions={TAG_SUGGESTIONS}
        />
      </Field>

      {isNew ? (
        <p className={hintClass + " lg:col-span-2"}>
          URL slug will be created from the name: <span className="text-ink">/{slugPreview}</span>
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2 · Category & attributes                                           */
/* ------------------------------------------------------------------ */

export function SectionAttributes({ draft, patch }) {
  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <Field label="Fabric" hint="Available to every category, not only sarees." htmlFor="pf-fabric">
          <Select
            id="pf-fabric"
            value={draft.fabric}
            onChange={(event) => patch({ fabric: event.target.value })}
            placeholder="Choose fabric"
            options={FABRIC_OPTIONS.map((entry) => ({ value: entry, label: entry }))}
            allowCustom
          />
        </Field>

        <Field label="Material" htmlFor="pf-material">
          <Select
            id="pf-material"
            value={draft.material}
            onChange={(event) => patch({ material: event.target.value })}
            placeholder="Choose material"
            options={MATERIAL_OPTIONS.map((entry) => ({ value: entry, label: entry }))}
            allowCustom
          />
        </Field>

        <Field label="Season" htmlFor="pf-season">
          <Select
            id="pf-season"
            value={draft.season}
            onChange={(event) => patch({ season: event.target.value })}
            placeholder="Choose season"
            options={SEASON_OPTIONS.map((entry) => ({ value: entry, label: entry }))}
          />
        </Field>

        <Field label="Fit" htmlFor="pf-fit">
          <TextInput
            id="pf-fit"
            value={draft.fit}
            onChange={(event) => patch({ fit: event.target.value })}
            placeholder="Regular, tailored, Relaxed…"
          />
        </Field>

        <Field label="Length" htmlFor="pf-length">
          <TextInput
            id="pf-length"
            value={draft.length}
            onChange={(event) => patch({ length: event.target.value })}
            placeholder="5.5 metres, ankle length…"
          />
        </Field>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Field label="Primary colour" htmlFor="pf-color-primary">
          <ChipRadio
            ariaLabel="Primary colour"
            options={COLOR_OPTIONS}
            value={draft.primaryColor}
            onChange={(value) => {
              const colors = [...new Set([value, draft.secondaryColor, ...draft.colors].filter(Boolean))];
              patch({ primaryColor: value, colors });
            }}
            allowCustom
          />
        </Field>

        <Field label="Secondary colour" htmlFor="pf-color-secondary">
          <ChipRadio
            ariaLabel="Secondary colour"
            options={COLOR_OPTIONS}
            value={draft.secondaryColor}
            onChange={(value) => {
              const colors = [...new Set([draft.primaryColor, value, ...draft.colors].filter(Boolean))];
              patch({ secondaryColor: value, colors });
            }}
            allowCustom
          />
        </Field>
      </div>

      <Field label="All stocked colours" hint="Customers pick from these on the product page.">
        <ChipGroup
          ariaLabel="Stocked colours"
          options={[...new Set([...COLOR_OPTIONS, ...draft.colors])]}
          value={draft.colors}
          onToggle={(colors) => patch({ colors })}
          allowCustom
        />
      </Field>

      <Field label="Sizes" hint="Free Size suits sarees and most ethnic drapes. Custom sizes allowed.">
        <ChipGroup
          ariaLabel="Sizes"
          options={[...new Set([...SIZE_OPTIONS, ...draft.sizes])]}
          value={draft.sizes}
          onToggle={(sizes) => patch({ sizes })}
          allowCustom
        />
      </Field>

      <Field label="Pattern">
        <ChipGroup
          ariaLabel="Pattern"
          options={[...new Set([...PATTERN_OPTIONS, ...draft.patterns])]}
          value={draft.patterns}
          onToggle={(patterns) => patch({ patterns })}
          allowCustom
        />
      </Field>

      <Field label="Work / embellishment" hint="Multiple selections allowed.">
        <ChipGroup
          ariaLabel="Work and embellishment"
          options={[...new Set([...WORK_OPTIONS, ...draft.work])]}
          value={draft.work}
          onToggle={(work) => patch({ work })}
          allowCustom
        />
      </Field>

      <Field label="Occasions" hint="Every occasion this piece suits.">
        <ChipGroup
          ariaLabel="Occasions"
          options={[...new Set([...OCCASION_OPTIONS, ...draft.occasion])]}
          value={draft.occasion}
          onToggle={(occasion) => patch({ occasion })}
          allowCustom
        />
      </Field>

      <Field label="Availability" htmlFor="pf-availability">
        <Select
          id="pf-availability"
          value={draft.availability}
          onChange={(event) => patch({ availability: event.target.value })}
          options={AVAILABILITY_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
        />
      </Field>
    </div>
  );
}
