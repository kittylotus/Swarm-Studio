import "./styles.css";
import { StudioApp } from "./app";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root.");

try {
  new StudioApp(root).mount();
} catch (error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error("Swarm Studio failed during boot", error);
  root.innerHTML = `
    <main class="boot-failure" role="alert">
      <section class="boot-failure__card">
        <div class="eyebrow">STARTUP ERROR</div>
        <h1>Studio couldn't finish booting.</h1>
        <p>The page server is reachable, but the app hit a JavaScript error while starting.</p>
        <pre>${escapeBootHtml(message)}</pre>
        <button type="button" onclick="location.reload()">Reload Studio</button>
      </section>
    </main>`;
}

function escapeBootHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char] ?? char));
}
