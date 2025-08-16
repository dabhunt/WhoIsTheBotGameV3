import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { Home } from "./pages/Home";
import { Game } from "./pages/Game";
import { Toaster } from "@/components/ui/toaster";
import { useGameState } from "./lib/websocket";

function App() {
  const initSession = useGameState((state) => state.initSession);
  const [, navigate] = useLocation();

  useEffect(() => {
    initSession(navigate);
  }, [initSession, navigate]);

  return (
    <>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/game/:id" component={Game} />
      </Switch>
      <Toaster />
    </>
  );
}

export default App;