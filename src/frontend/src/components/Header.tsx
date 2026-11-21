import { Link } from 'react-router-dom';
import { Contrast, Type } from 'lucide-react';
import type { Language, TranslationDict } from '../i18n/translations';

interface HeaderProps {
  t: TranslationDict;
  lang: Language;
  onChangeLang: (lang: Language) => void;
  largeText: boolean;
  onToggleLargeText: () => void;
  highContrast: boolean;
  onToggleHighContrast: () => void;
}

export function Header({
  t,
  lang,
  onChangeLang,
  largeText,
  onToggleLargeText,
  highContrast,
  onToggleHighContrast,
}: HeaderProps) {
  return (
    <header
      className="no-print sticky top-0 z-[1100] backdrop-blur-md"
      style={{
        backgroundColor: 'var(--glass-bg)',
        borderBottom: '1px solid var(--hairline)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 6px 18px -14px rgba(15,23,42,0.35)',
      }}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:font-semibold"
        style={{
          backgroundColor: 'var(--brand-primary)',
          color: 'var(--brand-on-primary)',
        }}
      >
        {t.skipToContent}
      </a>

      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2.5 py-1 no-underline"
          style={{ color: 'var(--ink-primary)' }}
        >
          {/* Minimal Swiss-geometric mark: parcel grid lines + clean water contour (zero background box) */}
          <svg
            width="26"
            height="26"
            viewBox="0 0 26 26"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <path
              d="M3 7.5H23M3 13H15.5M3 18.5H11"
              stroke="var(--ink-primary)"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              d="M19 13C19 13 15 17.6 15 20.1C15 22.3 16.8 24 19 24C21.2 24 23 22.3 23 20.1C23 17.6 19 13 19 13Z"
              fill="var(--brand-primary)"
            />
          </svg>
          <div className="flex items-baseline gap-2.5">
            <span className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--brand-primary)' }}>
              {t.appName}
            </span>
            <span className="hidden text-sm sm:inline" style={{ color: 'var(--ink-muted)' }}>
              {t.appSubtitle}
            </span>
          </div>
        </Link>

        <nav aria-label="Dostępność i język" className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={onToggleLargeText}
            aria-pressed={largeText}
            className="btn-ghost inline-flex min-h-[38px] items-center gap-1.5 rounded-md px-2.5 text-sm font-medium"
            style={
              largeText
                ? { backgroundColor: 'var(--bg-field)', color: 'var(--ink-primary)', fontWeight: 600 }
                : undefined
            }
          >
            <Type className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="hidden sm:inline">{t.a11yLargerText}</span>
          </button>

          <button
            type="button"
            onClick={onToggleHighContrast}
            aria-pressed={highContrast}
            className="btn-ghost inline-flex min-h-[38px] items-center gap-1.5 rounded-md px-2.5 text-sm font-medium"
            style={
              highContrast
                ? { backgroundColor: 'var(--ink-primary)', color: 'var(--bg-surface)', fontWeight: 600 }
                : undefined
            }
          >
            <Contrast className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="hidden sm:inline">{t.a11yHighContrast}</span>
          </button>

          <span
            aria-hidden="true"
            className="mx-1 h-4 w-px"
            style={{ backgroundColor: 'var(--hairline)' }}
          />

          <div
            role="group"
            aria-label="Language"
            className="inline-flex items-center gap-0.5"
          >
            {(['pl', 'en'] as const).map((code) => {
              const active = lang === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => onChangeLang(code)}
                  aria-pressed={active}
                  className="min-h-[34px] rounded-md px-2 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--bg-field)' : 'transparent',
                    color: active ? 'var(--ink-primary)' : 'var(--ink-muted)',
                  }}
                >
                  {code.toUpperCase()}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
}
