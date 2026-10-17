/**
 * PRATIKSHYA FASHION — PHASE 12 · the style-preferences screen, as a page of the design.
 *
 * The production screen is `pages/account/AccountPreferences.jsx`: four chip groups
 * (categories, fabrics, occasions, colours) whose options come from the catalogue
 * and the taxonomy the storefront already uses. This page re-hosts exactly that:
 *
 *   · the options are `taxonomyRepository.activeCategories()` and
 *     `catalogueValues` — the same live sources, not a second list;
 *   · the notes are read and written by `services/customer/stylePreferences`, the
 *     one seam for them.
 *
 * Truth about where the notes live. The backend has no style-preferences contract
 * (the store's own header records this as a BACKEND_GAP). So the notes are saved to
 * THIS DEVICE, per customer, and the page says so — it never reports them as saved
 * on the account. The store writes nothing without a signed-in customer id; in that
 * case the page says it cannot save, and disables the save, rather than confirming
 * a save that did not happen.
 */

import { useEffect, useMemo, useState } from 'react';
import Button from '../../components/ui/Button.jsx';
import AccountFrame from './AccountFrame.jsx';
import { useAuth } from '../../../../context/AuthContext.jsx';
import { catalogueValues } from '../../../../data/products/index.js';
import taxonomyRepository from '../../../../services/taxonomyRepository.js';
import {
  getStylePreferences,
  saveStylePreferences,
} from '../../../../services/customer/stylePreferences.js';

const PREFERENCES_TITLE = 'Style Preferences — PRATIKSHYA FASHION';
const FACETS = ['categories', 'fabrics', 'occasions', 'colours'];

function ChipGroup({ name, label, options, selected, onToggle }) {
  return (
    <fieldset className="pf-account__group">
      <legend className="pf-lab">{label}</legend>
      {options.length === 0 ? (
        <p className="pf-hint">No options are available yet.</p>
      ) : (
        <div className="pf-account__chips">
          {options.map((option) => {
            const active = selected.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                name={name}
                aria-pressed={active}
                className={active ? 'pf-account__chip pf-account__chip--on' : 'pf-account__chip'}
                onClick={() => onToggle(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

export default function Preferences() {
  const { user } = useAuth();
  const customerId = user?.id ?? null;

  const [prefs, setPrefs] = useState(() => getStylePreferences(customerId));
  /* 'saved' | 'failed' | null. Set only after the notes have been read back. */
  const [saveState, setSaveState] = useState(null);

  useEffect(() => {
    setPrefs(getStylePreferences(customerId));
    setSaveState(null);
  }, [customerId]);

  useEffect(() => {
    const previous = document.title;
    document.title = PREFERENCES_TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  const categories = useMemo(
    () => taxonomyRepository.activeCategories().map((entry) => ({ id: entry.id, label: entry.name })),
    [],
  );
  const fabrics = useMemo(() => catalogueValues.fabric.map((value) => ({ id: value, label: value })), []);
  const occasions = useMemo(() => catalogueValues.occasion.map((value) => ({ id: value, label: value })), []);
  const colours = useMemo(() => catalogueValues.color.map((value) => ({ id: value, label: value })), []);

  const toggle = (key, id) => {
    setPrefs((current) => {
      const list = current[key] || [];
      return { ...current, [key]: list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id] };
    });
    setSaveState(null);
  };

  /* The store swallows a refused write (quota, private browsing), so "saved" is
     claimed only when the stored notes read back exactly as they were submitted. */
  const handleSubmit = (event) => {
    event.preventDefault();
    if (!customerId) return;
    saveStylePreferences(customerId, prefs);
    const stored = getStylePreferences(customerId);
    const same = FACETS.every((key) => JSON.stringify(stored[key] ?? []) === JSON.stringify(prefs[key] ?? []));
    setSaveState(same ? 'saved' : 'failed');
  };

  return (
    <AccountFrame
      breadcrumbItems={[{ label: 'Account', to: '/account' }, { label: 'Style Preferences' }]}
      label="Your style"
      title="Style preferences"
    >
      <p className="info__lead pf-account__lead">
        Optional notes the atelier can use to shape what you see next. Nothing here is guessed.
      </p>

      <p className="pf-account__note" role="note">
        These notes are saved on this device only. They are not stored on your account yet.
      </p>

      {!customerId ? (
        <div className="empty" role="status">
          <p className="empty__title">Sign in to keep style notes.</p>
          <p>Without a signed-in account the notes cannot be saved, so saving is unavailable here.</p>
        </div>
      ) : null}

      <form className="form pf-form" onSubmit={handleSubmit} noValidate>
        <ChipGroup name="categories" label="Preferred categories" options={categories} selected={prefs.categories} onToggle={(id) => toggle('categories', id)} />
        <ChipGroup name="fabrics" label="Preferred fabrics" options={fabrics} selected={prefs.fabrics} onToggle={(id) => toggle('fabrics', id)} />
        <ChipGroup name="occasions" label="Preferred occasions" options={occasions} selected={prefs.occasions} onToggle={(id) => toggle('occasions', id)} />
        <ChipGroup name="colours" label="Preferred colours" options={colours} selected={prefs.colours} onToggle={(id) => toggle('colours', id)} />

        <div className="pf-account__actions">
          <Button type="submit" disabled={!customerId}>Save Preferences</Button>
          {saveState === 'saved' ? (
            <p role="status" className="form__note">Your style notes have been saved to this device.</p>
          ) : null}
          {saveState === 'failed' ? (
            <p role="alert" className="form__err pf-alert">
              Your style notes could not be saved on this device. Check that browser storage is available, then try again.
            </p>
          ) : null}
        </div>
      </form>
    </AccountFrame>
  );
}
