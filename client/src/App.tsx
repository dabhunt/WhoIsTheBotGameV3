import { Switch, Route } from "wouter";
import { Home } from "./pages/Home";
import { Game } from "./pages/Game";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/game/:id" component={Game} />
      </Switch>
    </QueryClientProvider>
  );
}

export default App;