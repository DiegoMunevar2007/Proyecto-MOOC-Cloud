import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Solo las cuentas se preparan por API. Toda la autoría, publicación e inscripción
// del recorrido se ejecuta desde la interfaz, como exige el enunciado.
test("profesor publica y estudiante consume, registra progreso y presenta quiz", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const password = randomUUID();
  const professor = `prof-${suffix}`;
  const student = `student-${suffix}`;
  const other = `other-${suffix}`;
  const admin = process.env.E2E_ADMIN_USER;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;
  if (!admin || !adminPassword)
    throw new Error(
      "Configura E2E_ADMIN_USER/E2E_ADMIN_PASSWORD o usa scripts/test_browser.py en local.",
    );
  const publicAdmin = await request.post("/api/v1/auth/register", {
    data: {
      username: `anon-${suffix}`,
      email: `anon-${suffix}@test.invalid`,
      password,
      role: "admin",
    },
  });
  expect(publicAdmin.status()).toBe(403);
  const auth = await request.post("/api/v1/auth/login", {
    data: { username: admin, password: adminPassword },
  });
  expect(auth.ok(), await auth.text()).toBeTruthy();
  const adminToken = (await auth.json()).token;
  for (const [username, role] of [
    [professor, "professor"],
    [student, "student"],
    [other, "professor"],
  ]) {
    const r = await request.post("/api/v1/auth/register", {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { username, email: `${username}@test.invalid`, password, role },
    });
    expect(r.status(), await r.text()).toBe(201);
  }
  async function login(username: string) {
    await page.goto("/ingresar");
    await page.getByLabel("Usuario", { exact: true }).fill(username);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page).not.toHaveURL(/ingresar/);
  }
  await login(professor);
  await page.goto("/ensenar");
  await page.getByRole("button", { name: "Crear curso", exact: true }).click();
  await page
    .getByLabel("Título", { exact: true })
    .fill(`Curso de prueba ${suffix}`);
  await page
    .getByLabel("Descripción", { exact: true })
    .fill("Aprende con una lectura, un video y una evaluación.");
  await page.getByRole("button", { name: "Crear borrador" }).click();
  await expect(page).toHaveURL(/ensenar\/\d+$/);
  const courseId = page.url().split("/").pop()!;
  await page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Agregar módulo", exact: true }),
    })
    .getByLabel("Título", { exact: true })
    .fill("Primer módulo");
  await page
    .getByRole("button", { name: "Agregar módulo", exact: true })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: /^Agregar unidad$/ })
    .click();
  const unitForm = page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Agregar unidad", exact: true }),
    });
  await unitForm.getByLabel("Título", { exact: true }).fill("Primera unidad");
  await unitForm
    .getByRole("button", { name: "Agregar unidad", exact: true })
    .click();
  async function addResource(type: string, title: string) {
    await page
      .locator("summary")
      .filter({ hasText: /^Agregar recurso$/ })
      .click();
    await page.getByLabel("Tipo de recurso").selectOption(type);
    await page.getByLabel("Título del recurso").fill(title);
    if (type === "text")
      await page
        .getByLabel("Contenido de la lectura")
        .fill(
          "Una cola compartida permite que varios workers procesen trabajos.",
        );
    await page
      .getByRole("button", { name: "Agregar recurso", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: new RegExp(title) }),
    ).toBeVisible();
  }
  await addResource("text", "Lectura inicial");
  await addResource("quiz", "Quiz inicial");
  await page.getByRole("link", { name: /Quiz inicial/ }).click();
  await page.getByRole("button", { name: "Crear quiz", exact: true }).click();
  await page
    .getByLabel("Pregunta", { exact: true })
    .fill("¿Qué comparten los workers?");
  await page
    .getByLabel("Opciones (una por línea)")
    .fill("La cola\nEl disco temporal");
  await page
    .getByRole("button", { name: "Agregar pregunta", exact: true })
    .click();
  await expect(page.getByText("1. ¿Qué comparten los workers?")).toBeVisible();
  await page.getByRole("link", { name: /Volver al editor/ }).click();
  if (process.env.E2E_MEDIA !== "false") {
    await addResource("video", "Video inicial");
    await page.getByRole("link", { name: /Video inicial/ }).click();
    await page
      .getByLabel("Archivo", { exact: true })
      .setInputFiles(
        process.env.E2E_VIDEO_PATH ??
          path.resolve(
            process.cwd(),
            "../capacity-planning/media/p1-small.mp4",
          ),
      );
    await page
      .getByRole("button", { name: "Subir archivo", exact: true })
      .click();
    await expect(page.getByText("Disponible", { exact: true })).toBeVisible({
      timeout: 180_000,
    });
    await page.getByRole("link", { name: /Volver al editor/ }).click();
  }
  await page.getByRole("button", { name: "Revisar publicación" }).click();
  await expect(page.getByText("Todo listo para publicar.")).toBeVisible();
  await page
    .getByRole("button", { name: "Publicar curso", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Ver curso publicado" }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/profesor-${suffix}.png`,
    fullPage: true,
  });
  await logout(page);
  await login(student);
  await page.goto(`/cursos/${courseId}`);
  await page.getByRole("button", { name: "Inscribirme", exact: true }).click();
  await expect(page.getByText("Estás inscrito", { exact: true })).toBeVisible();
  await page
    .getByRole("link", { name: "Lectura inicial", exact: true })
    .click();
  await expect(
    page.getByText("Apertura registrada en tu progreso."),
  ).toBeVisible();
  await page.getByRole("link", { name: /Volver al curso/ }).click();
  if (process.env.E2E_MEDIA !== "false") {
    await page
      .getByRole("link", { name: "Video inicial", exact: true })
      .click();
    await page.locator("video").evaluate((v: HTMLVideoElement) => v.play());
    await expect(page.getByText(/Progreso guardado/)).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("link", { name: /Volver al curso/ }).click();
  }
  await page.getByRole("link", { name: "Quiz inicial", exact: true }).click();
  await page.getByRole("button", { name: "Comenzar quiz" }).click();
  await page.getByLabel("La cola", { exact: true }).check();
  await page.getByRole("button", { name: "Enviar evaluación" }).click();
  await expect(
    page.getByRole("heading", { name: "Resultado: 100 / 100" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Ver resultado" }).click();
  await expect(
    page.getByRole("heading", { name: "Resultado: 100 / 100" }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/estudiante-${suffix}.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Resultado: 100 / 100" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: `test-results/estudiante-movil-${suffix}.png`,
    fullPage: true,
  });
  const studentToken = await page.evaluate(() =>
    localStorage.getItem("mooc.token"),
  );
  const denied = await request.post("/api/v1/courses", {
    headers: { Authorization: `Bearer ${studentToken}` },
    data: { title: "No autorizado" },
  });
  expect(denied.status()).toBe(403);
  const escalation = await request.post("/api/v1/auth/register", {
    headers: { Authorization: `Bearer ${studentToken}` },
    data: {
      username: `bad-${suffix}`,
      email: `bad-${suffix}@test.invalid`,
      password,
      role: "admin",
    },
  });
  expect(escalation.status()).toBe(403);
  const otherLogin = await request.post("/api/v1/auth/login", {
    data: { username: other, password },
  });
  const otherToken = (await otherLogin.json()).token;
  const deniedEdit = await request.put(`/api/v1/courses/${courseId}`, {
    headers: { Authorization: `Bearer ${otherToken}` },
    data: { title: "No autorizado" },
  });
  expect(deniedEdit.status()).toBe(403);
  await logout(page);
});
async function logout(page: Page) {
  await page.getByRole("button", { name: "Menú de la cuenta" }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(
    page.getByRole("link", { name: "Ingresar", exact: true }),
  ).toBeVisible();
}
