import { createRoot } from "react-dom/client";
import { initWeb3Modal } from "@/lib/wagmi";
import App from "./App";
import "./index.css";

// Initialise Web3Modal once at app startup (browser only, after wagmiConfig is ready)
initWeb3Modal();

createRoot(document.getElementById("root")!).render(<App />);
