import { useEffect, type RefObject } from "react";

/** Reveals story beats once and runs ambient motion only while it is on screen. */
export function useLandingMotion(pageRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const page = pageRef.current;
    if (!page || !("IntersectionObserver" in window)) return;

    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -5% 0px" },
    );
    page
      .querySelectorAll(".lv-reveal, .lv-reveal-group")
      .forEach((element) => revealObserver.observe(element));

    const ambientObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle("is-active", entry.isIntersecting);
        }
      },
      { threshold: 0.05 },
    );
    page
      .querySelectorAll(".lv-motion-loop")
      .forEach((element) => ambientObserver.observe(element));
    page.classList.add("lv-motion-ready");

    return () => {
      revealObserver.disconnect();
      ambientObserver.disconnect();
      page.classList.remove("lv-motion-ready");
    };
  }, [pageRef]);
}
