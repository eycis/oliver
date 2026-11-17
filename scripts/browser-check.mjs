// Optional smoke test: start Vite on 5173 and Chrome with --remote-debugging-port=9223.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const targets = await fetch("http://127.0.0.1:9223/json").then((r) => r.json());
const target = targets.find((t) => t.type === "page");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) =>
  socket.addEventListener("open", resolve, { once: true }),
);
let nextId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);
  if (data.id) {
    const pair = pending.get(data.id);
    pending.delete(data.id);
    data.error ? pair.reject(data.error) : pair.resolve(data.result);
  }
});
const cdp = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const result = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails)
    throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const pause = () => new Promise((r) => setTimeout(r, 300));
const click = async (text) => {
  assert.equal(
    await evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(text)})); if (!b) return false; b.click(); return true; })()`,
    ),
    true,
  );
  await pause();
};
const fill = (selector, value) =>
  evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
try {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp("Page.navigate", { url: "http://localhost:5173/" });
  for (let i = 0; i < 40; i++) {
    if (await evaluate(`!!document.querySelector('.letter')`)) break;
    await pause();
  }
  assert.equal(
    await evaluate(`!!document.querySelector('.letter')`),
    true,
    "Demo letter renders",
  );
  await evaluate(`localStorage.removeItem('love-demo')`);
  await cdp("Page.reload");
  await new Promise((r) => setTimeout(r, 1200));
  await writeFile(
    "/private/tmp/oliver-desktop.png",
    Buffer.from((await cdp("Page.captureScreenshot")).data, "base64"),
  );
  await fill(
    'input[aria-label="Komentář"]',
    "<img src=x onerror=alert(1)> Já & ty ♡",
  );
  await evaluate(`document.querySelector('.comment-form').requestSubmit()`);
  await pause();
  assert.equal(
    await evaluate(`document.querySelector('.comment p')?.textContent`),
    "Já & ty ♡",
  );
  assert.equal(await evaluate(`document.querySelector('.comment img')`), null);
  await evaluate(`document.querySelector('button[aria-label="Menu"]').click()`);
  await pause();
  assert.equal(
    await evaluate(`document.body.textContent.includes('Napsat nový vzkaz')`),
    false,
    "Message creation is not available",
  );
  assert.equal(
    await evaluate(`!!document.querySelector('.modal form')`),
    false,
  );
  await evaluate(
    `document.querySelector('.modal button[aria-label="Zavřít"]').click()`,
  );
  await pause();
  await cdp("Page.reload");
  await new Promise((r) => setTimeout(r, 900));
  assert.equal(
    await evaluate(`document.querySelector('.comment p')?.textContent`),
    "Já & ty ♡",
    "Comment persists",
  );
  await evaluate(`document.querySelector('button[aria-label="Menu"]').click()`);
  await pause();
  await evaluate(
    `document.querySelector('.modal button[aria-label="Zavřít"]').click()`,
  );
  await pause();
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await pause();
  assert.equal(
    await evaluate("document.documentElement.scrollWidth <= window.innerWidth"),
    true,
    "No mobile horizontal overflow",
  );
  await writeFile(
    "/private/tmp/oliver-mobile.png",
    Buffer.from(
      (await cdp("Page.captureScreenshot", { captureBeyondViewport: true }))
        .data,
      "base64",
    ),
  );
  const manifest = await fetch(
    "http://localhost:5173/manifest.webmanifest",
  ).then((r) => r.json());
  assert.equal(manifest.display, "standalone");
  assert.equal(
    await evaluate(`navigator.serviceWorker.ready.then(r => !!r.active)`),
    true,
  );
  assert.equal(
    await evaluate(`document.querySelector('input[type="email"]')`),
    null,
    "No email login",
  );
  await cdp("Page.navigate", {
    url: "http://localhost:5173/#key=" + "a".repeat(43),
  });
  await new Promise((r) => setTimeout(r, 900));
  assert.equal(
    await evaluate("location.hash"),
    "",
    "Private key removed from address bar",
  );
  assert.equal(
    await evaluate(`localStorage.getItem('love-private-key')`),
    null,
    "No access key is stored",
  );
  await evaluate(`localStorage.removeItem('love-private-key')`);
  console.log(
    "PASS: demo, sanitized comment, read-only message UI, persistence, mobile layout, manifest and service worker.",
  );
} finally {
  socket.close();
}
