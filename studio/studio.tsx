import { createRoot } from "react-dom/client";
import { Studio } from "sanity";
import config from "./sanity.config";

const root = createRoot(document.getElementById("sanity")!);

root.render(
  <Studio
    config={config}
    // The Studio is a public login page; all content access still requires
    // a Sanity account with membership in this project.
  />,
);