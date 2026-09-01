import { Building2, DollarSign, MessageCircle, Send, Shield, Wallet } from "lucide-react";

export type HelpArticle = {
  q: string;
  a: string;
};

export type HelpCategory = {
  icon: typeof Send;
  title: string;
  articles: HelpArticle[];
};

export const helpCategories: HelpCategory[] = [
  {
    icon: Send,
    title: "Transfers",
    articles: [
      { q: "How do I send money internationally?", a: "Enter the recipient details, choose your currencies and amount, review the fee breakdown, and confirm the transfer." },
      { q: "How long does a transfer take?", a: "Most transfers are completed within 1 to 2 business days, depending on destination, corridor support, and payment method." },
      { q: "Can I cancel a transfer?", a: "A transfer can usually be cancelled before it is processed. Once conversion or payout has started, cancellation may no longer be available." },
      { q: "What payment methods can I use?", a: "Available funding methods can include bank transfer, debit card, or wallet balance depending on country and corridor support." },
      { q: "Is there a transfer limit?", a: "Transfer limits depend on your verification level, corridor, and account configuration." },
    ],
  },
  {
    icon: DollarSign,
    title: "Fees & rates",
    articles: [
      { q: "How much does a transfer cost?", a: "Fees depend on the currency pair, corridor, and payment method. The exact fee should always be shown before you confirm." },
      { q: "What exchange rate do you use?", a: "Exchange rates depend on the live quote. Review the displayed rate and fee before submitting a conversion or transfer." },
      { q: "Are there hidden fees?", a: "No hidden fees should be charged. The platform is designed to show pricing before confirmation." },
      { q: "How does pricing compare to banks?", a: "Origin Wallet pricing is designed to be clearer than traditional bank FX markups, but final pricing depends on the selected corridor and quote." },
    ],
  },
  {
    icon: Wallet,
    title: "Wallet / account",
    articles: [
      { q: "What is the multi-currency wallet?", a: "It is a wallet experience that lets you view balances, receive funds, convert currencies, and send money through Origin Wallet infrastructure." },
      { q: "How do I add money to my wallet?", a: "You can usually add funds via linked bank accounts, inbound receipts, or supported receiving details where available." },
      { q: "Can I receive money in my wallet?", a: "Yes, once your profile and account setup are ready, you can use available receiving details in supported currencies." },
      { q: "Why is my account still pending?", a: "Your account can remain pending until profile details, onboarding, or KYC/KYB checks finish." },
    ],
  },
  {
    icon: Building2,
    title: "Business",
    articles: [
      { q: "Is there a business account?", a: "Yes. Business onboarding depends on the profile type, company information, and compliance requirements." },
      { q: "Can I pay multiple people at once?", a: "Batch or team payment features depend on the enabled product scope and the product configuration available to your account." },
      { q: "Do you offer an API?", a: "Yes. API capabilities can support onboarding, balances, beneficiaries, transfers, and related payment workflows." },
      { q: "How do team permissions work?", a: "Team permissions are designed around roles and approval flows, but exact capabilities depend on the configured product scope." },
    ],
  },
  {
    icon: Shield,
    title: "Security",
    articles: [
      { q: "How is my data protected?", a: "Sensitive data should be protected in transit and at rest by the platform and operational controls." },
      { q: "What if I notice suspicious activity?", a: "Contact support immediately and review recent transactions, beneficiaries, and team access." },
      { q: "Do you require identity verification?", a: "Yes, identity and business verification can be required depending on service type, limits, and onboarding rules." },
    ],
  },
  {
    icon: MessageCircle,
    title: "Contact & support",
    articles: [
      { q: "How can I contact support?", a: "You can use the contact page or the in-app help chat to get support." },
      { q: "What are your support hours?", a: "Support availability depends on the operating team. If an issue is urgent, send the request with enough account context for a faster handoff." },
      { q: "Can I request a callback?", a: "Yes, if callback handling is enabled by your support team." },
    ],
  },
];
