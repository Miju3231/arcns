import { Switch, Route, Router as WouterRouter } from "wouter";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { wagmiConfig } from "@/lib/wagmi";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Home from "@/pages/Home";
import DomainDetail from "@/pages/DomainDetail";
import MyDomains from "@/pages/MyDomains";
import Explore from "@/pages/Explore";
import Reservations from "@/pages/Reservations";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/domain/:name" component={DomainDetail} />
      <Route path="/my-domains" component={MyDomains} />
      <Route path="/explore" component={Explore} />
      <Route path="/reservations" component={Reservations} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <div className="min-h-screen bg-black text-white flex flex-col">
            <Header />
            <main className="flex-1">
              <Router />
            </main>
            <Footer />
            <Toaster
              position="top-center"
              theme="dark"
              richColors
              closeButton
            />
          </div>
        </WouterRouter>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
