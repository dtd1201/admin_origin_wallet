import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type Language = "en" | "vi" | "zh-CN" | "ja";

export interface LanguageOption {
  code: Language;
  nameEn: string;
  name: string;
  nativeName: string;
  flag: string;
  googleCode: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: "en", nameEn: "English", name: "English", nativeName: "English", flag: "US", googleCode: "en" },
  { code: "vi", nameEn: "Vietnamese", name: "Tieng Viet", nativeName: "Tieng Viet", flag: "VN", googleCode: "vi" },
  { code: "zh-CN", nameEn: "Chinese", name: "Chinese", nativeName: "Chinese", flag: "CN", googleCode: "zh-CN" },
  { code: "ja", nameEn: "Japanese", name: "Japanese", nativeName: "Japanese", flag: "JP", googleCode: "ja" },
];

export const getLanguageByCode = (code: string): LanguageOption | undefined => {
  return LANGUAGES.find((lang) => lang.code === code);
};

interface LanguageContextType {
  currentLanguage: Language;
  setLanguage: (lang: Language) => void;
  isTranslating: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

declare global {
  interface Window {
    googleTranslateElementInit: () => void;
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [currentLanguage, setCurrentLanguage] = useState<Language>("en");
  const [isTranslating, setIsTranslating] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const checkGoogle = () => {
      const combo = document.querySelector(".goog-te-combo");
      if (combo) {
        setIsReady(true);
        return true;
      }
      return false;
    };

    if (!checkGoogle()) {
      const interval = window.setInterval(() => {
        if (checkGoogle()) {
          window.clearInterval(interval);
        }
      }, 300);

      const originalInit = window.googleTranslateElementInit;
      window.googleTranslateElementInit = () => {
        originalInit?.();
        window.setTimeout(checkGoogle, 500);
      };

      return () => window.clearInterval(interval);
    }
  }, []);

  const doTranslate = useCallback(async (langCode: string): Promise<boolean> => {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 30;
      const interval = 150;

      const attempt = () => {
        attempts += 1;

        const combo = document.querySelector(".goog-te-combo") as HTMLSelectElement | null;
        if (combo) {
          try {
            combo.value = langCode;
            combo.dispatchEvent(new Event("change", { bubbles: true }));
            localStorage.setItem("google_translate_language", langCode);
            resolve(true);
            return;
          } catch {
            // Ignore and continue retrying.
          }
        }

        const selectById = document.getElementById(":0") as HTMLSelectElement | null;
        if (selectById) {
          try {
            selectById.value = langCode;
            selectById.dispatchEvent(new Event("change", { bubbles: true }));
            localStorage.setItem("google_translate_language", langCode);
            resolve(true);
            return;
          } catch {
            // Ignore and continue retrying.
          }
        }

        if (attempts >= maxAttempts) {
          const domain = window.location.hostname;
          document.cookie = `googtrans=/en/${langCode}; path=/`;
          document.cookie = `googtrans=/en/${langCode}; path=/; domain=${domain}`;

          const url = new URL(window.location.href);
          url.searchParams.set("tl", langCode);
          window.location.href = url.toString();
          resolve(false);
          return;
        }

        window.setTimeout(attempt, interval);
      };

      attempt();
    });
  }, []);

  useEffect(() => {
    if (!isFirstRender.current) {
      return;
    }

    isFirstRender.current = false;

    const applySaved = async () => {
      let waited = 0;
      while (!isReady && waited < 5000) {
        await new Promise((resolve) => window.setTimeout(resolve, 200));
        waited += 200;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 1500));

      const urlParams = new URLSearchParams(window.location.search);
      const urlLang = urlParams.get("tl");
      const savedLang = localStorage.getItem("website_language");
      const targetLang = urlLang || savedLang;

      if (targetLang && targetLang !== "en") {
        const langInfo = getLanguageByCode(targetLang);
        if (langInfo) {
          setCurrentLanguage(langInfo.code);
          await doTranslate(langInfo.googleCode);
        }
      }
    };

    void applySaved();
  }, [doTranslate, isReady]);

  const setLanguage = useCallback(
    async (lang: Language) => {
      if (lang === currentLanguage) {
        return;
      }

      setIsTranslating(true);
      setCurrentLanguage(lang);
      localStorage.setItem("website_language", lang);

      if (lang === "en") {
        document.cookie = "googtrans=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC";
        localStorage.removeItem("google_translate_language");

        const url = new URL(window.location.href);
        url.searchParams.delete("tl");
        window.location.href = url.toString();
      } else {
        const langInfo = getLanguageByCode(lang);
        if (langInfo) {
          await doTranslate(langInfo.googleCode);
        }
      }

      window.setTimeout(() => setIsTranslating(false), 2000);
    },
    [currentLanguage, doTranslate],
  );

  return <LanguageContext.Provider value={{ currentLanguage, setLanguage, isTranslating }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
