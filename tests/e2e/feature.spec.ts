import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("topic + ratings sync; histogram bins update", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.waitForTimeout(800);

    await a.getByRole("button", { name: "start", exact: true }).click();
    await a.waitForTimeout(400);

    const dropperIsA = await a
      .locator(".our-turn.is-me, .our-current-name")
      .innerText()
      .then((t) => t.toLowerCase().includes("alice"))
      .catch(() => true);
    const dropper = dropperIsA ? a : b;
    const other = dropperIsA ? b : a;

    await dropper.getByPlaceholder("your topic").fill("AI agents");
    await dropper.getByRole("button", { name: "drop topic", exact: true }).click();
    await other.waitForTimeout(400);

    await dropper.locator(".our-slider").fill("-100");
    await other.locator(".our-slider").fill("-100");
    await other.waitForTimeout(500);

    const aBin = await other.locator('.our-bin[data-bin="0"]').getAttribute("data-count");
    if (aBin !== "2") throw new Error("expected -100 bin=2, got " + aBin);
    expect(aBin).toBe("2");
  } finally {
    await cleanup();
  }
});
