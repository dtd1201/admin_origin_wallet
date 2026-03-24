import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { setupRuntimeProtection } from "@/lib/runtimeProtection";

setupRuntimeProtection();

createRoot(document.getElementById("root")!).render(<App />);
