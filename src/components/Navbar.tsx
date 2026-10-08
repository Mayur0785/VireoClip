import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import vireoLogo from '../assets/brand/vireo-logo.svg';
import '../pages/landing-foundation.css';

const links = [
  { label: 'Product', href: '/#product' },
  { label: 'Solutions', href: '/#use-cases' },
  { label: 'Resources', href: '/#how' },
  { label: 'Pricing', href: '/#pricing' },
];

export function Navbar() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const ctaPath = isAuthenticated ? '/projects/new' : '/signup';
  const ctaLabel = isAuthenticated ? 'Clip a video' : 'Get free clips';

  return (
    <header className={`lp-navbar${scrolled ? ' is-scrolled' : ''}${open ? ' is-open' : ''}`}>
      <nav className="lp-nav-inner" aria-label="Main navigation">
        <Link to="/" className="lp-nav-logo" aria-label="Vireo home" onClick={() => setOpen(false)}>
          <img src={vireoLogo} alt="Vireo" width="116" height="33" />
        </Link>
        <div className="lp-nav-links">
          {links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </div>
        <div className="lp-nav-actions">
          {isAuthenticated ? (
            <Link className="lp-nav-login" to="/dashboard">Dashboard</Link>
          ) : (
            <Link className="lp-nav-login" to="/login">Log in</Link>
          )}
          <Link className="lp-button lp-button-dark" to={ctaPath}>
            {ctaLabel} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <button
          className="lp-menu-button"
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="lp-mobile-menu"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>
      </nav>
      {open && (
        <div className="lp-mobile-menu" id="lp-mobile-menu">
          {links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</a>)}
          <Link to={isAuthenticated ? '/dashboard' : '/login'} onClick={() => setOpen(false)}>
            {isAuthenticated ? 'Dashboard' : 'Log in'}
          </Link>
          <Link className="lp-button lp-button-dark" to={ctaPath} onClick={() => setOpen(false)}>
            {ctaLabel} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      )}
    </header>
  );
}
