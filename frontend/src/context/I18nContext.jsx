import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DICT } from '../lib/i18n';
import { apiFetch } from '../lib/api';

const I18nContext = createContext({
  lang: 'en',
  setLanguage: async () => {},
  syncLanguageFromUser: () => {},
  t: (k) => k,
});

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem('hp_lang');
    return saved === 'bn' ? 'bn' : 'en';
  });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const syncLanguageFromUser = useCallback((userLang) => {
    if (userLang === 'bn' || userLang === 'en') {
      setLangState(userLang);
      localStorage.setItem('hp_lang', userLang);
    }
  }, []);

  const setLanguage = useCallback(async (nextLang, persistToServer = true) => {
    const valid = nextLang === 'bn' ? 'bn' : 'en';
    setLangState(valid);
    localStorage.setItem('hp_lang', valid);
    if (persistToServer) {
      await apiFetch('/auth/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ preferredLanguage: valid }),
      }).catch(() => {});
    }
  }, []);

  const t = useCallback(
    (key) => {
      return DICT[lang]?.[key] || DICT.en[key] || key;
    },
    [lang]
  );

  return (
    <I18nContext.Provider value={{ lang, setLanguage, syncLanguageFromUser, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
