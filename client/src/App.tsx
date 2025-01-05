import { Switch, Route } from "wouter";
import { Home } from "./pages/Home";
import { Game } from "./pages/Game";
import { Toaster } from "@/components/ui/toaster";

function App() {
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