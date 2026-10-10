import { Link } from "react-router-dom";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-[#e1e7db] bg-[#f2f4ec]">
      <div className="mx-auto grid max-w-[1288px] gap-10 px-5 py-16 md:grid-cols-[2fr_repeat(4,1fr)] lg:px-8">
        <div>
          <Logo />
          <p className="mt-5 max-w-[230px] font-display text-xl leading-snug text-forest">
            One video. Every platform.
          </p>
        </div>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-forest">
            Product
          </h2>
          <div className="mt-5 space-y-3 text-xs text-[#667b69]">
            <a className="block hover:text-clay" href="/#product">
              Workspace
            </a>
            <a className="block hover:text-clay" href="/#platforms">
              Platforms
            </a>
            <a className="block hover:text-clay" href="/#pricing">
              Plans
            </a>
          </div>
        </div>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-forest">
            Resources
          </h2>
          <div className="mt-5 space-y-3 text-xs text-[#667b69]">
            <a className="block hover:text-clay" href="/#how">
              How it works
            </a>
            <a className="block hover:text-clay" href="/#faq">
              FAQ
            </a>
          </div>
        </div>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-forest">
            Company
          </h2>
          <div className="mt-5 space-y-3 text-xs text-[#667b69]">
            <Link className="block hover:text-clay" to="/">
              Vireo
            </Link>
            <a className="block hover:text-clay" href="/#use-cases">
              Who it's for
            </a>
          </div>
        </div>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-forest">
            Legal
          </h2>
          <div className="mt-5 space-y-3 text-xs text-[#667b69]">
            <Link className="block hover:text-clay" to="/terms">
              Terms of Service
            </Link>
            <Link className="block hover:text-clay" to="/privacy">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1288px] flex-col justify-between gap-2 border-t border-[#dfe6da] px-5 py-6 text-xs text-[#7b8a7c] sm:flex-row lg:px-8">
        <span>© {new Date().getFullYear()} Vireo.</span>
        <span>Made for the ideas you already create.</span>
      </div>
    </footer>
  );
}
