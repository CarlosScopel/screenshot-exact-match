import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// The workflow serves the unchanged Cloudflare production build with Wrangler.
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const directory = "qa-reports";
await mkdir(directory, { recursive: true });
const report = {
  commit: process.env.GITHUB_SHA,
  tests: [],
  limitations: [
    "No real account credentials or service-role keys are used. Email delivery, admin mutations and authenticated production RLS require separate integration validation.",
  ],
  pageErrors: [],
  networkErrors: [],
  hostingTelemetry: [],
  authSettings: null,
};
const base = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;
let currentPage;
async function check(name, action) {
  try {
    await action();
    report.tests.push({ name, status: "passed" });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.tests.push({ name, status: "failed", error: String(error) });
    throw error;
  }
}
async function enterDemo(page) {
  await page
    .getByRole("button", { name: "Preencher login de teste", exact: true })
    .waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Preencher login de teste", exact: true }).click();
  await page.getByRole("button", { name: "Entrar na plataforma", exact: true }).click();
  await page.getByText("Prévia de mentorado", { exact: true }).waitFor();
}
async function navigate(page, label, mobile = false) {
  if (mobile) await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.locator("nav").getByRole("button", { name: label, exact: true }).click();
}
try {
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    try {
      const response = await fetch(
        `${process.env.VITE_SUPABASE_URL.replace(/\/$/, "")}/auth/v1/settings`,
        {
          headers: { apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          signal: AbortSignal.timeout(15000),
        },
      );
      const result = await response.json();
      report.authSettings = {
        status: response.status,
        disable_signup: result.disable_signup,
        mailer_autoconfirm: result.mailer_autoconfirm,
        email_provider: result.external?.email,
      };
    } catch (error) {
      report.authSettings = { error: String(error) };
    }
  }
  await check("production-worker-starts", async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(base, { signal: AbortSignal.timeout(1500) });
        if (response.ok) return;
      } catch {
        /* Starting worker. */
      }
      await wait(500);
    }
    throw new Error("Production worker did not respond successfully; see server.log");
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  currentPage = page;
  page.on("pageerror", (error) => report.pageErrors.push(String(error)));
  page.on("requestfailed", (request) =>
    report.networkErrors.push({
      path: new URL(request.url()).pathname,
      failure: request.failure()?.errorText,
    }),
  );
  await check("desktop-login-loads", async () => {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Preencher login de teste", exact: true })
      .waitFor({ timeout: 30000 });
    await page.screenshot({ path: `${directory}/desktop-login.png`, fullPage: true });
  });
  await check("demo-login-enters-learner-dashboard", () => enterDemo(page));
  const writes = [];
  page.on("request", (request) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) return;
    const url = new URL(request.url());
    const entry = { method: request.method(), path: url.pathname };
    // The published host injects analytics. Keep those separate from app mutations,
    // but do not exempt any Supabase request, server function, or unknown endpoint.
    if (
      entry.method === "POST" &&
      url.origin === new URL(base).origin &&
      entry.path === "/__l5e/trackevents"
    ) {
      report.hostingTelemetry.push(entry);
    } else {
      writes.push(entry);
    }
  });
  await check("desktop-dashboard", async () => {
    await page.getByRole("heading", { name: /Alex/ }).waitFor();
    await page.screenshot({ path: `${directory}/desktop-dashboard.png`, fullPage: true });
  });
  await check("training-modules-and-lesson", async () => {
    await navigate(page, "Treinamentos");
    await page.getByRole("button", { name: /Fundamentos da Estratégia/ }).click();
    await page.getByRole("heading", { name: "Fundamentos da Estratégia", exact: true }).waitFor();
    await page.getByRole("button", { name: "Organizando sua Jornada", exact: true }).click();
    await page.getByRole("heading", { name: "Organizando sua Jornada", exact: true }).waitFor();
    assert.equal(await page.locator("video[controls]").count(), 1);
  });
  await check("lesson-progress-and-private-notes-local-demo", async () => {
    await page.getByRole("button", { name: "Marcar como concluída", exact: true }).click();
    await page.getByRole("button", { name: "Desmarcar conclusão", exact: true }).waitFor();
    await page
      .getByPlaceholder("Anotações privadas desta aula...")
      .fill("Anotação temporária da validação automatizada.");
    await page.getByRole("button", { name: "Salvar anotação", exact: true }).click();
    await page.getByText("Anotação salva apenas nesta demonstração.", { exact: true }).waitFor();
  });
  await check("library-article", async () => {
    await navigate(page, "Biblioteca");
    await page.getByText("Ler artigo", { exact: true }).first().click();
    await page.getByRole("heading", { name: "Checklist inicial", exact: true }).waitFor();
  });
  await check("tools-no-fake-active-integration", async () => {
    await navigate(page, "Ferramentas");
    assert.equal(await page.getByText("Em breve", { exact: true }).count(), 2);
    assert.equal(await page.getByRole("link", { name: /Abrir ferramenta/ }).count(), 0);
  });
  await check("announcements", async () => {
    await navigate(page, "Comunicados");
    await page.getByRole("heading", { name: "Bem-vindo à A ORDEM", exact: true }).waitFor();
  });
  await check("learner-profile-has-no-admin-controls", async () => {
    await navigate(page, "Meu perfil");
    await page.getByText("mentorado@demo.aordem", { exact: true }).last().waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Abrir administração", exact: true }).count(),
      0,
    );
  });
  await check("theme-switch", async () => {
    const before = await page.locator("html").evaluate((el) => el.classList.contains("light"));
    await page.getByRole("button", { name: "Alternar tema", exact: true }).click();
    assert.notEqual(
      before,
      await page.locator("html").evaluate((el) => el.classList.contains("light")),
    );
  });
  await check("demo-has-no-backend-writes", async () => {
    assert.deepEqual(writes, []);
  });
  await check("demo-logout", async () => {
    await page.getByRole("button", { name: "Encerrar demonstração", exact: true }).click();
    await page.getByRole("button", { name: "Preencher login de teste", exact: true }).waitFor();
  });
  await context.close();
  currentPage = undefined;
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await mobile.newPage();
  phone.setDefaultTimeout(15000);
  currentPage = phone;
  phone.on("pageerror", (error) => report.pageErrors.push(String(error)));
  await check("mobile-login-and-dashboard", async () => {
    await phone.goto(base, { waitUntil: "domcontentloaded" });
    await enterDemo(phone);
    const width = await phone.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    assert.ok(width.document <= width.viewport + 1, JSON.stringify(width));
    await phone.screenshot({ path: `${directory}/mobile-dashboard.png`, fullPage: true });
  });
  await check("mobile-sidebar-and-library", async () => {
    await navigate(phone, "Biblioteca", true);
    await phone.getByRole("heading", { name: "Biblioteca", exact: true }).waitFor();
    await phone.screenshot({ path: `${directory}/mobile-library.png`, fullPage: true });
  });
  await check("no-unhandled-browser-errors", async () => {
    assert.deepEqual(report.pageErrors, []);
  });
  await mobile.close();
  currentPage = undefined;
} catch (error) {
  report.error = String(error);
  if (currentPage && !currentPage.isClosed())
    await currentPage
      .screenshot({ path: `${directory}/browser-failure.png`, fullPage: true })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await writeFile(`${directory}/browser.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
