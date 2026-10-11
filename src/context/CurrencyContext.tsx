import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export type SupportedCurrency = 'USD' | 'INR';

interface CurrencyContextType {
  currency: SupportedCurrency;
  setCurrency: (c: SupportedCurrency) => void;
  formatPrice: (usdAmount: number, inrAmount?: number, interval?: 'month' | 'year') => string;
  currencySymbol: string;
}

const STORAGE_KEY = 'vireoclip_currency_preference';

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<SupportedCurrency>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'INR' || saved === 'USD') return saved;
    } catch {}
    return 'USD';
  });

  const setCurrency = useCallback((newCurrency: SupportedCurrency) => {
    setCurrencyState(newCurrency);
    try {
      localStorage.setItem(STORAGE_KEY, newCurrency);
    } catch {}
  }, []);

  const currencySymbol = useMemo(() => (currency === 'INR' ? '₹' : '$'), [currency]);

  /**
   * Formats a given amount based on the selected currency and interval.
   * Uses authoritative configured numbers without arbitrary currency conversions.
   */
  const formatPrice = useCallback(
    (usdAmount: number, inrAmount?: number, interval?: 'month' | 'year'): string => {
      if (currency === 'INR') {
        if (inrAmount === undefined) {
          return 'Unavailable';
        }
        const formatted = inrAmount.toLocaleString('en-IN');
        return interval ? `₹${formatted}/${interval === 'year' ? 'yr' : 'mo'}` : `₹${formatted}`;
      }

      // USD
      return interval ? `$${usdAmount}/${interval === 'year' ? 'yr' : 'mo'}` : `$${usdAmount}`;
    },
    [currency]
  );

  const value = useMemo(
    () => ({
      currency,
      setCurrency,
      formatPrice,
      currencySymbol,
    }),
    [currency, setCurrency, formatPrice, currencySymbol]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};

export const useCurrency = (): CurrencyContextType => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return ctx;
};
