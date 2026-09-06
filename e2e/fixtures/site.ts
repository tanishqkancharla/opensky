import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/** The real test page reports DOM events to its own HTTP backend. No SDK/driver doubles. */
export interface PageState {
  text?: string;
  html?: string;
  bold?: boolean;
  pasteCount?: number;
  pasteText?: string;
  pasteHtml?: string;
  trustedPaste?: boolean;
  moved?: boolean;
  trustedWheel?: boolean;
  phase?: string;
  removedClicks?: number;
}

export interface Site {
  url: string;
  read(): Promise<PageState>;
  close(): Promise<void>;
}

export async function servePage(body: string): Promise<Site> {
  let state: PageState = {};
  const server = createServer(async (request, response) => {
    response.setHeader("Connection", "close");
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/state" && request.method === "GET") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(state));
    } else if (request.url === "/state" && request.method === "POST") {
      let data = "";
      for await (const chunk of request) {
        data += chunk;
        if (data.length > 100_000) { response.writeHead(413).end(); return; }
      }
      try { state = { ...state, ...JSON.parse(data) }; response.writeHead(204).end(); }
      catch { response.writeHead(400).end(); }
    } else if (request.url === "/" && request.method === "GET") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>OpenSky SDK fixture</title></head><body>${body}</body></html>`);
    } else response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  return {
    url,
    async read() {
      const response = await fetch(new URL("state", url));
      if (!response.ok) throw new Error(`Fixture backend read failed: ${response.status}`);
      return response.json() as Promise<PageState>;
    },
    async close() {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

const report = `const report = patch => fetch('/state', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});`;

export const editorPage = `
<main><label>Draft message<textarea aria-label="Draft message"></textarea></label>
<div role="textbox" aria-label="Rich message" contenteditable="true"></div>
<output id="receipt" aria-live="polite">Waiting for input</output></main>
<script>${report}
let pasteCount = 0;
for (const editor of document.querySelectorAll('textarea,[contenteditable]')) {
  editor.addEventListener('paste', event => {
    pasteCount++;
    const patch = {pasteCount, trustedPaste:event.isTrusted,
      pasteText:event.clipboardData.getData('text/plain'),pasteHtml:event.clipboardData.getData('text/html')};
    // Read after the browser's default paste action, never synthesize it here.
    setTimeout(() => {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node, bold = false;
      while ((node = walker.nextNode())) {
        if (node.textContent.includes('Priority')) bold = Number(getComputedStyle(node.parentElement).fontWeight) >= 600;
      }
      report({...patch,text:editor.value ?? editor.textContent,html:editor.innerHTML,bold});
    }, 0);
  });
  editor.addEventListener('input', () => {
    document.querySelector('#receipt').textContent = 'Editor contains: ' + (editor.value ?? editor.textContent);
  });
}
</script>`;

export const canvasPage = `
<style>html,body{margin:0;height:100%;overflow:hidden}canvas{display:block;width:100vw;height:100vh}output{position:fixed;top:8px;left:8px;pointer-events:none}</style>
<canvas aria-label="Canvas scroller"></canvas><output aria-live="polite">Canvas at start</output>
<script>${report}
const canvas = document.querySelector('canvas');
canvas.width = innerWidth; canvas.height = innerHeight;
canvas.getContext('2d').fillRect(0,0,innerWidth,innerHeight);
canvas.addEventListener('wheel', event => {
  if (event.isTrusted && event.deltaY > 0) {
    document.querySelector('output').textContent = 'Canvas moved down';
    report({moved:true,trustedWheel:true});
  }
});
</script>`;

export function collectionPage(kind: "list" | "article" | "table"): string {
  const entries = ["alpha", "beta", "gamma"].map(name => {
    const contents = `<span>Qualifier ${name}: provisional</span><button>Inspect ${name}</button>` +
      Array.from({ length: 32 }, (_, index) => `<p>Supporting detail ${name} ${index}</p>`).join("");
    return kind === "list" ? `<li>${contents}</li>` : kind === "table"
      ? `<tr><td>${contents}</td></tr>` : `<section>${contents}</section>`;
  }).join("");
  return kind === "list" ? `<main><ul aria-label="Entries">${entries}</ul></main>`
    : kind === "table" ? `<main><table aria-label="Records"><tbody>${entries}</tbody></table></main>`
    : `<main><article aria-label="Reference">${entries}</article></main>`;
}

export const latePage = `
<button>Load later result</button><output aria-live="polite">Waiting</output>
<script>${report}
document.querySelector('button').onclick = () => setTimeout(() => {
  document.querySelector('output').textContent = 'Later result ready';
  report({phase:'ready'});
}, 350);
</script>`;

export const stalePage = `
<button id="discard">Discard control</button><button id="retire">Retire disposable control</button>
<output aria-live="polite">Control present</output>
<script>${report}
document.querySelector('#discard').onclick = () => report({removedClicks:1});
document.querySelector('#retire').onclick = () => {
  document.querySelector('#discard').remove();
  document.querySelector('output').textContent = 'Control removed';
  report({removedClicks:0});
};
</script>`;
