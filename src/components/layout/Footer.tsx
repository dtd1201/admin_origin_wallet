import { Link } from "react-router-dom";

const footerLinks = {
  Products: [
    { label: "Personal", href: "/personal" },
    { label: "Business", href: "/business" },
    { label: "Pricing", href: "/pricing" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Security", href: "/security" },
    { label: "Contact", href: "/contact" },
  ],
  Support: [
    { label: "Help center", href: "/help" },
    { label: "FAQs", href: "/help" },
  ],
  Legal: [
    { label: "Privacy policy", href: "/policies#privacy" },
    { label: "Terms of service", href: "/policies#terms" },
    { label: "Disclaimer", href: "/policies#disclaimer" },
  ],
};

const Footer = () => {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container-wide mx-auto section-padding">
        {/* Parent Company Highlight */}
        <div className="bg-white/5 rounded-2xl p-6 mb-10 border border-white/10">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-shrink-0">
              <img 
                src="/logo/knt-logo.svg" 
                alt="KNT - Khoi Nguyen Technology" 
                className="h-16 w-auto"
              />
            </div>
            <div className="text-center md:text-left">
              <h3 className="text-lg font-bold text-white mb-1">
                CÔNG TY CỔ PHẦN CÔNG NGHỆ KHỞI NGUYÊN
              </h3>
              <p className="text-sm text-primary-foreground/60">
                Khoi Nguyen Technology Joint Stock Company
              </p>
            </div>
            <div className="md:ml-auto flex gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-accent">2022</div>
                <div className="text-xs text-primary-foreground/50">Established</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-accent">170+</div>
                <div className="text-xs text-primary-foreground/50">Countries</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-accent">50+</div>
                <div className="text-xs text-primary-foreground/50">Currencies</div>
              </div>
            </div>
          </div>
        </div>

        {/* Top */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1 mb-4 lg:mb-0">
            <div className="flex items-center gap-2 font-extrabold text-lg mb-3">
              <img 
                src="/logo/logo.jpg" 
                alt="Origin Wallet" 
                className="w-7 h-7 rounded-md object-contain"
              />
              <span className="hidden lg:inline">
                <span className="text-accent">ORIGIN</span> WALLET
              </span>
            </div>
            <p className="text-primary-foreground/70 text-sm leading-relaxed max-w-xs">
              Ví điện tử dựa trên - nền tảng, gốc rễ, bền vững
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="font-semibold text-sm mb-4 text-primary-foreground/90">{title}</h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-sm text-primary-foreground/60 hover:text-primary-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-primary-foreground/10 pt-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="text-xs text-primary-foreground/50 leading-relaxed max-w-2xl">
              <p className="mb-2">
                A platform by <strong className="text-primary-foreground/70">KHOI NGUYEN TECHNOLOGY JSC</strong>
              </p>
              <p>
                Origin Wallet is a financial technology platform. Services described on this website are for informational purposes. 
                Origin Wallet does not claim to hold any specific licenses or regulatory approvals unless explicitly stated. 
                Fees and exchange rates shown are illustrative and may vary.
              </p>
            </div>
            <div className="text-xs text-primary-foreground/40">
              © {new Date().getFullYear()} KHOI NGUYEN TECHNOLOGY JSC. All rights reserved.
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;