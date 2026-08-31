"use client";

export type LocaleView = {
  code: string;
  nativeName: string;
  direction: string;
  isDefault: boolean;
};

export function LocaleTabs({
  locales,
  active,
  onSelect,
  isTranslated,
}: {
  locales: LocaleView[];
  active: string;
  onSelect: (code: string) => void;
  isTranslated: (code: string) => boolean;
}) {
  return (
    <div className="tabs" role="tablist">
      {locales.map((l) => (
        <button
          key={l.code}
          type="button"
          role="tab"
          aria-selected={active === l.code}
          onClick={() => onSelect(l.code)}
        >
          {l.nativeName}
          {!isTranslated(l.code) && <span className="dot" title="Not translated yet" />}
        </button>
      ))}
    </div>
  );
}
