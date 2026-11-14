import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const directory = "qa-reports";
await mkdir(directory, { recursive: true });
const base = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const backend = process.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const report = {
  commit: process.env.GITHUB_SHA,
  scope: "Public production-build routes; authenticated account journeys require separate integration tests.",
  tests: [],
  pageErrors: [],
  unexpectedWrites: [],
  authSettings: null,
};
let browser;
let currentPage;
async function check(name, task) {
  try {
    await task();
    report.tests.push({ name, status: "passed" });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.tests.push({ name, status: "failed", error: String(error) });
    throw error;
  }
}
async function fits(page) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(size.document <= size.viewport + 1, JSON.stringify(size));
}
try {
  await check("production-worker-starts", async () => {
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const response = await fetch(base, { signal: AbortSignal.timeout(1500) });
        if (response.ok) return;
      } catch { /* Worker starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Production worker did not start; inspect server.log.");
  });
  if (backend && process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    await check("auth-email-and-approval-configuration", async () => {
      const response = await fetch(`${backend}/auth/v1/settings`, {
        headers: { apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, 200);
      const settings = await response.json();
      report.authSettings = { disable_signup: settings.disable_signup, mailer_autoconfirm: settings.mailer_autoconfirm, email_provider: settings.external?.email };
      assert.equal(settings.disable_signup, true);
      assert.equal(settings.mailer_autoconfirm, false);
      assert.equal(settings.external?.email, true);
    });
  }
  browser = await chromium.launch({ headless: true });
  for (const mobile of [false, true]) {
    const label = mobile ? "mobile" : "desktop";
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    const page = await context.newPage();
    currentPage = page;
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => report.pageErrors.push(String(error)));
    page.on("request", (request) => {
      if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) return;
      const url = new URL(request.url());
      const telemetry = request.method() === "POST" && url.origin === new URL(base).origin && url.pathname === "/__l5e/trackevents";
      const brandingRead = request.method() === "POST" && backend && url.href === `${backend}/rest/v1/rpc/get_public_branding` && ["{}", "", null].includes(request.postData());
      if (!telemetry && !brandingRead) report.unexpectedWrites.push({ method: request.method(), path: url.pathname });
    });
    await check(`${label}-login-without-demo-or-owner-shortcuts`, async () => {
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Entrar na plataforma", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Preencher login de teste", exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Ativar acesso de administrador", exact: true }).count(), 0);
      assert.equal(await page.locator("aside nav").count(), 0);
      await fits(page);
      await page.screenshot({ path: `${directory}/${label}-login.png`, fullPage: true });
    });
    await check(`${label}-email-icon-spacing-and-form-validation`, async () => {
      const input = page.getByRole("textbox", { name: "E-mail", exact: true });
      const gap = await input.evaluate((el) => {
        const icon = el.parentElement.querySelector("svg");
        return el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft) - icon.getBoundingClientRect().right;
      });
      assert.ok(gap >= 8, `Text/icon gap: ${gap}`);
      await input.fill("invalid-email");
      assert.equal(await input.evaluate((el) => el.checkValidity()), false);
      await input.fill("qa@example.invalid");
      assert.equal(await input.evaluate((el) => el.checkValidity()), true);
      assert.equal(await page.getByLabel("Senha", { exact: true }).getAttribute("type"), "password");
    });
    await check(`${label}-request-access-form`, async () => {
      await page.getByRole("button", { name: "Quero fazer parte de A ORDEM", exact: true }).click();
      await page.getByRole("heading", { name: "Solicite sua entrada", exact: true }).waitFor();
      await page.getByLabel("Seu nome", { exact: true }).fill("QA visual sem envio");
      await page.getByRole("textbox", { name: "E-mail", exact: true }).fill("qa@example.invalid");
      assert.equal(await page.locator("form").evaluate((el) => el.checkValidity()), true);
      assert.equal(await page.locator("input[type=password]").count(), 0);
      await fits(page);
      await page.screenshot({ path: `${directory}/${label}-request.png`, fullPage: true });
      await page.getByRole("button", { name: "Voltar ao login", exact: true }).click();
    });
    await check(`${label}-recovery-request-form-without-sending-mail`, async () => {
      await page.getByRole("button", { name: "Esqueceu sua senha?", exact: true }).click();
      await page.getByRole("heading", { name: "Recuperar acesso", exact: true }).waitFor();
      await page.getByRole("textbox", { name: "E-mail", exact: true }).fill("qa@example.invalid");
      await page.getByRole("button", { name: "Enviar instruções", exact: true }).waitFor();
      await fits(page);
    });
    await check(`${label}-invalid-recovery-link-cannot-set-password`, async () => {
      await page.goto(`${base}/reset-password?error=access_denied&type=recovery`, { waitUntil: "domcontentloaded" });
      await page.getByText("Este link é inválido, expirou ou já foi utilizado. Solicite um novo link para definir sua senha.", { exact: true }).waitFor();
      assert.equal(await page.locator("input[type=password]").count(), 0);
      await page.getByRole("button", { name: "Solicitar novo link", exact: true }).click();
      await page.getByRole("heading", { name: "Recuperar acesso", exact: true }).waitFor();
      await fits(page);
    });
    await check(`${label}-not-found-route`, async () => {
      await page.goto(`${base}/qa-validation-not-found`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Página não encontrada", exact: true }).waitFor();
      await page.getByRole("link", { name: "Voltar ao início", exact: true }).click();
      await page.getByRole("button", { name: "Entrar na plataforma", exact: true }).waitFor();
    });
    await context.close();
    currentPage = undefined;
  }
  await check("public-checks-do-not-mutate-backend-or-send-emails", async () => assert.deepEqual(report.unexpectedWrites, []));
  await check("no-unhandled-browser-errors", async () => assert.deepEqual(report.pageErrors, []));
} catch (error) {
  report.error = String(error);
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: `${directory}/browser-failure.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await writeFile(`${directory}/browser.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
