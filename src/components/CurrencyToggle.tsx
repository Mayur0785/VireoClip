import React from 'react';
import { useCurrency, SupportedCurrency } from '../context/CurrencyContext';

interface CurrencyToggleProps {
  className?: string;
  size?: 'sm' | 'md';
}

export const CurrencyToggle: React.FC<CurrencyToggleProps> = ({
  className = '',
  size = 'md',
}) => {
  const { currency, setCurrency } = useCurrency();

  const handleSelect = (c: SupportedCurrency) => {
    if (c !== currency) {
      setCurrency(c);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, c: SupportedCurrency) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleSelect(c);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      handleSelect('INR');
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      handleSelect('USD');
    }
  };

  const isSm = size === 'sm';

  return (
    <div
      role="radiogroup"
      aria-label="Display currency selection"
      className={`inline-flex items-center rounded-xl bg-white/[0.04] p-1 border border-white/10 backdrop-blur-md shadow-sm transition-colors ${className}`}
    >
      <button
        type="button"
        role="radio"
        aria-checked={currency === 'USD'}
        tabIndex={currency === 'USD' ? 0 : -1}
        onClick={() => handleSelect('USD')}
        onKeyDown={(e) => handleKeyDown(e, 'USD')}
        className={`relative inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#080B12] ${
          isSm ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-xs sm:text-sm'
        } ${
          currency === 'USD'
            ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/30 font-bold border border-purple-400/30'
            : 'text-zinc-400 hover:text-white hover:bg-white/5'
        }`}
      >
        <span>USD</span>
        <span className={currency === 'USD' ? 'text-purple-200 font-mono' : 'text-zinc-500 font-mono'}>
          ($)
        </span>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={currency === 'INR'}
        tabIndex={currency === 'INR' ? 0 : -1}
        onClick={() => handleSelect('INR')}
        onKeyDown={(e) => handleKeyDown(e, 'INR')}
        className={`relative inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#080B12] ${
          isSm ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-xs sm:text-sm'
        } ${
          currency === 'INR'
            ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/30 font-bold border border-purple-400/30'
            : 'text-zinc-400 hover:text-white hover:bg-white/5'
        }`}
      >
        <span>INR</span>
        <span className={currency === 'INR' ? 'text-purple-200 font-mono' : 'text-zinc-500 font-mono'}>
          (₹)
        </span>
      </button>
    </div>
  );
};
