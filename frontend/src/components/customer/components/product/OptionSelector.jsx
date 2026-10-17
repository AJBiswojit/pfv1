import { cx } from '../../utils/format.js';

/** Renders a product's option group as accessible radio chips. */
export default function OptionSelector({ group, value, onChange, error, compact }) {
  if (!group) return null;
  const id = `opt-${group.name.replace(/\W/g, '')}`;
  return (
    <fieldset className={cx('options', compact && 'options--compact', error && 'has-error')}>
      <legend className="options__legend">
        {group.name}
        {value && <span className="options__value"> · {value}</span>}
      </legend>
      <div className="options__list" role="radiogroup" aria-labelledby={id}>
        {group.values.map((v) => (
          <button
            key={v.value}
            type="button"
            role="radio"
            aria-checked={value === v.value}
            disabled={!v.available}
            className={cx('chip', value === v.value && 'is-active', !v.available && 'is-out')}
            onClick={() => onChange(v.value)}
            title={v.available ? v.value : `${v.value} — unavailable`}
          >
            {v.value}
          </button>
        ))}
      </div>
      {error && <p className="options__error" role="alert">{error}</p>}
    </fieldset>
  );
}
