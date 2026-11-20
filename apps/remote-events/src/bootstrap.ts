// Standalone dev only (the shell never loads bootstrap): tokens + preflight the shell would provide.
import "@poc/design-system/standalone.css";
import { mount } from "./mount.js";

// No shell here, so no events capability: the remote shows "events unavailable".
const target = document.getElementById("root");
if (!target) throw new Error("Missing app root");
mount(target, {});
