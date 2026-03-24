import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const CookieConsent = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!localStorage.getItem("ow-cookie-consent")) {
        setShow(true);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const accept = () => {
    localStorage.setItem("ow-cookie-consent", "accepted");
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4"
        >
          <div className="container-tight mx-auto bg-card border border-border rounded-2xl shadow-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <p className="text-sm text-muted-foreground flex-1">
              We use cookies to improve your experience. By continuing to use this site, you agree to our{" "}
              <a href="/policies#privacy" className="underline text-foreground hover:text-accent transition-colors">
                cookie policy
              </a>.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="hero" onClick={accept}>Accept all</Button>
              <Button size="sm" variant="ghost" onClick={accept}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CookieConsent;
