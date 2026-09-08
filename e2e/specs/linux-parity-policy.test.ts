import { expect, test } from "vitest";
import { DesktopProgramPolicy } from "../../evals/parity/desktop-program.js";

const linux = test.extend<{ policy: DesktopProgramPolicy }>({
  policy: async ({}, use) => use(new DesktopProgramPolicy({ backend: "native", appSelectors: [], isolatedDesktop: "linux" })),
});

linux("native Linux can observe screenshots and use its real desktop input API", ({ policy }) => {
  expect(policy.accepts('globalThis.sky = (await import("@oai/sky")).sky;')).toBe(true);
  expect(policy.accepts('var images = await sky.get_screenshot(); await nodeRepl.emitImage(images[0].data_url);')).toBe(true);
  expect(policy.accepts('await sky.click({x:100,y:200}); await sky.press_key({key:"CTRL+S"});')).toBe(true);
  expect(policy.accepts('await sky.type_text({text:"hello"}); await sky.scroll({direction:"down",pixels:500});')).toBe(true);
});

linux("Linux desktop access does not grant filesystem, process or computed-call access", ({ policy }) => {
  expect(policy.accepts('var fs = await import("node:fs/promises"); await fs.readFile("/tmp/answer.docx");')).toBe(false);
  expect(policy.accepts('await sky["press_key"]({key:"CTRL+S"});')).toBe(false);
  expect(policy.accepts('var images = await sky.get_screenshot(); images[0].constructor("return process")();')).toBe(false);
  expect(policy.accepts('await sky.start_audio_recording();')).toBe(false);
});

linux("agents can wait for rendering without gaining arbitrary callback execution", ({ policy }) => {
  expect(policy.accepts('await sky.click({x:791,y:557,mouse_button:"left"}); await new Promise(resolve => setTimeout(resolve, 700)); var images = await sky.get_screenshot(); await nodeRepl.emitImage(images[0].data_url);')).toBe(true);
  expect(policy.accepts('await new Promise(resolve => setTimeout(() => sky.press_key({key:"CTRL+q"}), 700));')).toBe(false);
  expect(policy.accepts('var setTimeout = images[0];')).toBe(false);
  expect(policy.accepts('await new Promise(setTimeout => setTimeout(setTimeout, 700));')).toBe(false);
});

test("ordinary native app scope does not silently become full-desktop Linux scope", () => {
  const policy = new DesktopProgramPolicy({ backend: "native", appSelectors: ["LibreOffice"] });
  expect(policy.accepts('await sky.get_screenshot();')).toBe(false);
  expect(policy.accepts('await sky.press_key({key:"CTRL+S"});')).toBe(false);
  expect(policy.accepts('await sky.press_key({app:"LibreOffice",key:"CTRL+S"});')).toBe(true);
});
