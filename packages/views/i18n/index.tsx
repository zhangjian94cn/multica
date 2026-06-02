"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getIssuePriorityLabel,
  getIssueStatusLabel,
  getProjectPriorityLabel,
  getProjectStatusLabel,
  translatePhrase,
  translateWithParams,
} from "./translations";

export type AppLocale = "en" | "zh";

export const localeLabels: Record<AppLocale, string> = {
  en: "English",
  zh: "简体中文",
};

const STORAGE_KEY = "multica-locale";
const COOKIE_NAME = "multica-locale";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const ROUTE_TITLE_TRANSLATIONS: Record<string, string> = {
  Issues: "问题",
  Issue: "问题",
  Projects: "项目",
  Project: "项目",
  Autopilot: "自动驾驶",
  "My Issues": "我的问题",
  Runtimes: "运行时",
  Skills: "技能",
  Agents: "智能体",
  Inbox: "收件箱",
  Settings: "设置",
};

interface AppLocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  text: (en: string, zh: string) => string;
  t: (key: string, params?: Record<string, string | number>) => string;
  translate: (value: string) => string;
  dateLocale: string;
}

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

function isLocale(value: unknown): value is AppLocale {
  return value === "en" || value === "zh";
}

function readCookieLocale(): AppLocale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    /(?:^|;\s*)multica-locale=(en|zh)(?:;|$)/,
  );
  return isLocale(match?.[1]) ? match[1] : null;
}

function readStoredLocale(): AppLocale | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function detectBrowserLocale(): AppLocale {
  if (typeof navigator === "undefined") return "en";
  const languages = navigator.languages ?? [navigator.language];
  return languages.some((value) => /^zh\b/i.test(value)) ? "zh" : "en";
}

function resolveInitialLocale(): AppLocale {
  return readCookieLocale() ?? readStoredLocale() ?? detectBrowserLocale();
}

function persistLocale(locale: AppLocale) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Ignore storage failures (private mode / denied storage).
    }
  }

  if (typeof document !== "undefined") {
    document.cookie = `${COOKIE_NAME}=${locale}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    document.documentElement.lang = locale;
  }
}

export function translateAppTitle(title: string, locale: AppLocale): string {
  if (locale !== "zh") return title;
  return ROUTE_TITLE_TRANSLATIONS[title] ?? translatePhrase(title, locale);
}

const ATTRIBUTES_TO_TRANSLATE = ["placeholder", "aria-label", "title", "alt"];

const SKIP_TEXT_SELECTOR = [
  "script",
  "style",
  "pre",
  "code",
  "kbd",
  "samp",
  "[contenteditable='true']",
  ".ProseMirror",
  "[data-no-translate]",
].join(",");

function shouldSkipTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  return Boolean(parent.closest(SKIP_TEXT_SELECTOR));
}

function LocaleDomTranslator({ locale }: { locale: AppLocale }) {
  const textOriginals = useRef<WeakMap<Text, string>>(new WeakMap());
  const attrOriginals = useRef<WeakMap<Element, Map<string, string>>>(
    new WeakMap(),
  );

  useEffect(() => {
    const body = document.body;
    if (!body) return;

    const processText = (node: Text) => {
      if (shouldSkipTextNode(node)) return;

      if (locale !== "zh") {
        const original = textOriginals.current.get(node);
        if (original != null && node.data !== original) node.data = original;
        if (original != null) textOriginals.current.delete(node);
        return;
      }

      const storedOriginal = textOriginals.current.get(node);
      const current = node.data;
      const currentStoredTranslation =
        storedOriginal == null ? null : translatePhrase(storedOriginal, "zh");
      const original =
        storedOriginal != null && current === currentStoredTranslation
          ? storedOriginal
          : current;
      const translated = translatePhrase(original, "zh");

      if (translated !== original) {
        textOriginals.current.set(node, original);
        if (current !== translated) node.data = translated;
      }
    };

    const processAttributes = (el: Element) => {
      for (const attr of ATTRIBUTES_TO_TRANSLATE) {
        const current = el.getAttribute(attr);
        if (!current) continue;

        if (locale !== "zh") {
          const originals = attrOriginals.current.get(el);
          const original = originals?.get(attr);
          if (original != null && current !== original) {
            el.setAttribute(attr, original);
          }
          originals?.delete(attr);
          continue;
        }

        let originals = attrOriginals.current.get(el);
        const storedOriginal = originals?.get(attr);
        const currentStoredTranslation =
          storedOriginal == null ? null : translatePhrase(storedOriginal, "zh");
        const original =
          storedOriginal != null && current === currentStoredTranslation
            ? storedOriginal
            : current;
        const translated = translatePhrase(original, "zh");

        if (translated !== original) {
          if (!originals) {
            originals = new Map<string, string>();
            attrOriginals.current.set(el, originals);
          }
          originals.set(attr, original);
          if (current !== translated) el.setAttribute(attr, translated);
        }
      }
    };

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        processText(node as Text);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      processAttributes(el);
      if (el.matches(SKIP_TEXT_SELECTOR)) return;
      el.childNodes.forEach(walk);
    };

    let scheduled = false;
    const flush = () => {
      scheduled = false;
      walk(body);
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(flush);
    };

    flush();

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.type === "childList" || m.type === "characterData" || m.type === "attributes")) {
        schedule();
      }
    });
    observer.observe(body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES_TO_TRANSLATE,
    });

    return () => observer.disconnect();
  }, [locale]);

  return null;
}

export function AppLocaleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(resolveInitialLocale);

  useEffect(() => {
    persistLocale(locale);
  }, [locale]);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
  }, []);

  const text = useCallback(
    (en: string, zh: string) => (locale === "zh" ? zh : en),
    [locale],
  );
  const translate = useCallback(
    (value: string) => translatePhrase(value, locale),
    [locale],
  );
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translateWithParams(key, locale, params),
    [locale],
  );

  const value = useMemo<AppLocaleContextValue>(
    () => ({
      locale,
      setLocale,
      text,
      t,
      translate,
      dateLocale: locale === "zh" ? "zh-CN" : "en-US",
    }),
    [locale, setLocale, text, t, translate],
  );

  return (
    <AppLocaleContext.Provider value={value}>
      <LocaleDomTranslator locale={locale} />
      {children}
    </AppLocaleContext.Provider>
  );
}

export function useAppLocale() {
  const context = useContext(AppLocaleContext);
  if (!context) {
    throw new Error(
      "App locale not initialised — wrap the app in <AppLocaleProvider>",
    );
  }
  return context;
}

export {
  getIssuePriorityLabel,
  getIssueStatusLabel,
  getProjectPriorityLabel,
  getProjectStatusLabel,
  translatePhrase,
};
