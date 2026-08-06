import { Mail, Menu, Phone, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { createWhatsAppUrl, formatIndianPhone, officialPhoneNumbers, officialWhatsApp } from '../config/contact.js';
import { trackEvent } from '../services/analytics.js';
import { useSiteSettings } from '../services/content.js';
import { ChatWidget } from './ChatWidget.jsx';
import { PoweredBy } from './PoweredBy.jsx';

const links = [['/', 'Home'], ['/about', 'About'], ['/services', 'Services'], ['/partner', 'Partner With Us'], ['/gallery', 'Gallery'], ['/contact', 'Contact']];

function WhatsAppIcon() {
  return <svg className="whatsapp-mark" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.875 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 7.021 2.91 9.83 9.83 0 0 1 2.9 7.019c-.003 5.45-4.437 9.884-9.888 9.884m8.413-18.297A11.82 11.82 0 0 0 12.105 0C5.495 0 .116 5.376.113 11.986c0 2.113.551 4.172 1.6 5.987L.012 24l6.165-1.617a11.98 11.98 0 0 0 5.923 1.51h.005c6.607 0 11.986-5.376 11.99-11.986A11.82 11.82 0 0 0 20.99 3.59z"/>
  </svg>;
}

export function SiteLayout() {
  const [open, setOpen] = useState(false); const location = useLocation();
  const settings = useSiteSettings(); const contact = settings.data?.contact; const hasPublishedPhones = Boolean(contact?.phones?.length); const phones = hasPublishedPhones ? contact.phones : officialPhoneNumbers; const phone = phones[0]; const whatsapp = hasPublishedPhones && contact?.whatsapp ? contact.whatsapp : officialWhatsApp.number;
  const emailReady = Boolean(contact?.email);
  const officeAddress = contact?.addressLines?.length ? [...contact.addressLines, contact.city, contact.state, contact.pinCode].filter(Boolean).join(', ') : 'No. 881/A, Yashodhara Complex, Dr. M. C. Modi Road, Shankarmutt Main Road, Basaveshwara Nagar, Bengaluru, Karnataka 560079';
  const locationNote = contact?.locationNote || 'VFS GROUP, 3rd Floor'; const latitude = contact?.mapLatitude || '12.998319625854492'; const longitude = contact?.mapLongitude || '77.54251098632812';
  const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}&z=17&hl=en`;
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }, [location.pathname]);
  useEffect(() => { trackEvent('page_view', {}, location.pathname); }, [location.pathname]);
  return <div className="min-h-screen bg-canvas text-ink">
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <header className="site-header">
      <div className="shell header-inner">
        <Link to="/" className="brand" aria-label="VFS Groups home"><img src="/brand/vfs-groups-logo.png" alt="VFS Groups"/><span>VFS Groups<small>Your financial growth</small></span></Link>
        <nav className="desktop-nav" aria-label="Primary navigation">{links.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav>
        <div className="header-actions"><Link className="button button-dark" to="/sign-in">Sign in</Link><Link className="button button-gold" to="/apply">Apply now</Link></div>
        <button className="menu-button" type="button" aria-expanded={open} aria-controls="mobile-navigation" aria-label={open ? 'Close navigation' : 'Open navigation'} onClick={() => setOpen((value) => !value)}>{open ? <X/> : <Menu/>}</button>
      </div>
      {open && <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">{links.map(([to, label]) => <NavLink key={to} to={to} onClick={() => setOpen(false)}>{label}</NavLink>)}<Link className="button button-dark" to="/sign-in" onClick={() => setOpen(false)}>Sign in</Link><Link className="button button-gold" to="/apply" onClick={() => setOpen(false)}>Apply now</Link></nav>}
    </header>
    <main id="main-content" key={location.pathname}><Outlet/></main>
    <a className="whatsapp-fab" href={createWhatsAppUrl('Hello VFS Groups, I would like assistance choosing a financial service.', whatsapp)} target="_blank" rel="noreferrer" aria-label="Contact VFS Groups on WhatsApp"><WhatsAppIcon/></a>
    <ChatWidget phone={phone} whatsapp={whatsapp}/>
    <footer className="site-footer">
      <div className="shell footer-office"><div><span className="eyebrow">GST-registered office</span><h2>{settings.data?.legal?.legalName || 'VFS GROUP'}</h2><b className="office-location-note">{locationNote}</b><address>{officeAddress}</address><strong>GSTIN: {settings.data?.legal?.gstNumber || '29ABBFV2204K1Z5'}</strong><a href={mapUrl} target="_blank" rel="noreferrer">Open exact location in Google Maps</a></div><iframe title="VFS GROUP registered office map" src={`${mapUrl}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen/></div>
      <div className="shell footer-grid">
        <div><Link to="/" className="brand footer-brand"><img src="/brand/vfs-groups-logo.png" alt=""/><span>VFS Groups<small>Your financial growth, our commitment</small></span></Link><p>One destination for loan assistance, insurance guidance, investments, and wealth services.</p><p className="footer-disclosure">{settings.data?.legal?.providerRelationship}</p></div>
        <div><h2>Explore</h2><Link to="/services">Services</Link><Link to="/emi-calculator">EMI calculator</Link><Link to="/customer/dashboard">Customer dashboard</Link><Link to="/partner">Partner program</Link><Link to="/faqs">FAQs</Link></div>
        <div><h2>Company</h2><Link to="/about">About</Link><Link to="/gallery">Gallery</Link><Link to="/contact">Contact</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/disclaimer">Disclaimer</Link><Link className="footer-admin-link" to="/admin/sign-in" aria-label="Open the separate administrator sign-in page"><ShieldCheck size={14}/> Admin portal</Link></div>
        <div className="footer-contact"><h2>Talk to us</h2>{phones.map((number) => <a href={`tel:+${number.replace(/\D/g, '')}`} key={number}><Phone/> {formatIndianPhone(number)}</a>)}<a className="footer-whatsapp-link" href={createWhatsAppUrl('Hello VFS Groups, I would like financial service assistance.', whatsapp)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${formatIndianPhone(whatsapp)}`}><WhatsAppIcon/>{formatIndianPhone(whatsapp)}</a>{emailReady && <a href={`mailto:${contact.email}`}><Mail/> {contact.email}</a>}<p>{contact?.officeHours || 'Contact our team for support hours.'}</p></div>
      </div>
      <div className="shell footer-bottom"><div><p>© {new Date().getFullYear()} VFS Groups. All rights reserved.</p><PoweredBy compact/></div><p className="footer-terms-line">{settings.data?.cashback?.enabled ? settings.data.cashback.terms : 'Eligibility and final terms are decided by the relevant provider. Cashback applies only where a specific eligible offer is published.'}</p></div>
    </footer>
  </div>;
}
