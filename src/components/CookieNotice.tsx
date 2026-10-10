import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, X } from 'lucide-react';

const STORAGE_KEY = 'vireo_cookie_notice_dismissed';

export const CookieNotice: React.FC = () => {
  const [dismissed, setDismissed] = useState<boolean>(true);

  useEffect(() => {
    try {
      const isDismissed = localStorage.getItem(STORAGE_KEY) === 'true';
      setDismissed(isDismissed);
    } catch {
      // LocalStorage access restricted (private mode, etc.)
      setDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Ignore write errors
    }
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <aside
      aria-label="Privacy and storage notice"
      role="region"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-2xl rounded-2xl border border-[#dfe7da] bg-[#ffffff]/95 p-4 text-[#1a2e22] shadow-xl backdrop-blur-md transition-all sm:bottom-6 sm:left-6 sm:right-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="size-5 shrink-0 text-[#36764c] mt-0.5" aria-hidden="true" />
          <div className="text-xs leading-relaxed text-[#425947]">
            <span className="font-semibold text-[#183d2d]">Essential Storage & Privacy Notice: </span>
            Vireo uses essential browser storage strictly for authentication and interface settings. We do not use third-party advertising trackers or marketing cookies. Learn more in our{' '}
            <Link
              to="/privacy"
              className="font-medium text-[#246844] underline hover:text-[#183d2d]"
            >
              Privacy Policy
            </Link>
            .
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg bg-[#246844] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1b5034] focus:outline-none focus:ring-2 focus:ring-[#246844] focus:ring-offset-1"
          >
            Acknowledge
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss privacy notice"
            className="rounded-lg p-1.5 text-[#78867a] hover:bg-[#f0f4ec] hover:text-[#183d2d] focus:outline-none"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
