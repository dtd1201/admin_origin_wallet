import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, MessageCircle, SendHorizonal, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { helpCategories } from "@/data/help-center";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

const quickPrompts = [
  "How do I connect Currenxie?",
  "How do I add a beneficiary?",
  "Why is my account pending?",
  "How long does a transfer take?",
];

const knowledgeBase = helpCategories.flatMap((category) =>
  category.articles.map((article) => ({
    category: category.title,
    question: article.q,
    answer: article.a,
    searchText: `${category.title} ${article.q} ${article.a}`.toLowerCase(),
  })),
);

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);

const buildAssistantReply = (question: string) => {
  const tokens = normalize(question);

  if (tokens.length === 0) {
    return "Ask me about transfers, balances, provider connection, profile setup, or security.";
  }

  if (tokens.includes("currenxie") || (tokens.includes("provider") && tokens.includes("connect"))) {
    return "To connect Currenxie, open Integrations, choose Currenxie, and select Connect provider. After your profile is completed, the provider account can move into the onboarding flow.";
  }

  const bestMatch = knowledgeBase
    .map((item) => ({
      ...item,
      score: tokens.reduce((total, token) => total + (item.searchText.includes(token) ? 1 : 0), 0),
    }))
    .sort((left, right) => right.score - left.score)[0];

  if (bestMatch && bestMatch.score > 0) {
    return `${bestMatch.answer} If you want, I can also help with ${bestMatch.category.toLowerCase()} next.`;
  }

  return "I could not find an exact answer yet. Try asking about transfers, fees, wallet balances, provider connection, profile, or security.";
};

const HelpChatbot = () => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi, I am your Origin Wallet helper. Ask me about transfers, balances, account setup, or provider connection.",
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const suggestions = useMemo(
    () => helpCategories.map((category) => category.title).slice(0, 4),
    [],
  );

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  const submitMessage = (value: string) => {
    const question = value.trim();
    if (!question) {
      return;
    }

    const timestamp = Date.now();
    setMessages((current) => [
      ...current,
      { id: `user-${timestamp}`, role: "user", content: question },
      { id: `assistant-${timestamp + 1}`, role: "assistant", content: buildAssistantReply(question) },
    ]);
    setInput("");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-gray-900 dark:bg-white dark:text-[#111318] dark:hover:bg-gray-100">
          <MessageCircle className="h-4 w-4" />
          Help
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex h-full w-full flex-col border-l border-gray-200 bg-white p-0 sm:max-w-md dark:border-white/10 dark:bg-[#161b22]"
      >
        <SheetHeader className="border-b border-gray-200 px-6 py-5 dark:border-white/10">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 text-white shadow-sm">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle className="text-left text-xl font-semibold text-gray-900 dark:text-white">
                Help assistant
              </SheetTitle>
              <SheetDescription className="text-left text-sm text-gray-500 dark:text-gray-400">
                Quick answers for wallet, transfers, and provider onboarding.
              </SheetDescription>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => submitMessage(prompt)}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:border-green-500/40 dark:hover:bg-green-500/10 dark:hover:text-green-300"
              >
                {prompt}
              </button>
            ))}
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="rounded-2xl border border-green-100 bg-green-50/80 p-4 text-sm text-green-900 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-100">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4" />
              Suggested topics
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submitMessage(suggestion)}
                  className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-100 dark:bg-[#1c2128] dark:text-gray-200 dark:hover:bg-[#252c35]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",
                  message.role === "user"
                    ? "bg-[#5b4ce6] text-white"
                    : "border border-gray-200 bg-gray-50 text-gray-800 dark:border-white/10 dark:bg-[#1c2128] dark:text-gray-100",
                )}
              >
                {message.content}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-gray-200 px-6 py-4 dark:border-white/10">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitMessage(input);
            }}
            className="flex items-center gap-3"
          >
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask something..."
              className="h-11 rounded-full border-gray-200 bg-white px-4 dark:border-white/10 dark:bg-[#1c2128] dark:text-white"
            />
            <Button
              type="submit"
              size="icon"
              className="h-11 w-11 rounded-full bg-[#5b4ce6] text-white hover:bg-[#4d40cb]"
            >
              <SendHorizonal className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default HelpChatbot;
