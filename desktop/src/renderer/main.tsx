import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppProvider } from "./components/ui";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <App />
  </AppProvider>,
);
