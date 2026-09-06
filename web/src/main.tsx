import { createRoot } from "react-dom/client";

import { App } from "./App";
import { IconSprite } from "./components/icons/IconSprite";
import "./styles/legacy.css";
import "./styles/phase-additions.css";

createRoot(document.getElementById("root")!).render(
  <>
    <IconSprite />
    <App />
  </>,
);
