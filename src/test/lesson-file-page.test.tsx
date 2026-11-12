import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalApp } from "@/components/portal/Portal";
import { createDemoPortalData } from "@/lib/demo";

const mock = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/portal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal")>()),
  loadPortalData: mock.load,
}));
vi.mock("@/lib/auth", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  isMemberBlocked: () => false,
  useAuth: () => ({
    session: { user: { id: "student", email: "student@example.test" } },
    profile: { full_name: "Aluno" },
    isAdmin: false,
    loading: false,
    settings: null,
    refresh: vi.fn(),
    refreshSettings: vi.fn(),
    requiresPasswordSetup: false,
    clearPasswordSetup: vi.fn(),
  }),
}));
vi.mock("@/lib/use-mentorship", () => ({
  useMentorshipAccount: () => ({
    account: { user_id: "student", status: "active", plans: [], legacy_expires_at: null },
    error: "",
    loading: false,
    now: Date.now(),
    refresh: vi.fn(),
  }),
}));
vi.mock("@/components/portal/AdminPage", () => ({ AdminPage: () => null }));
vi.mock("@/components/portal/AccessScreen", () => ({ AccessScreen: () => null }));
vi.mock("@/components/portal/LessonFiles", () => ({
  LessonFiles: ({ materials }: { materials: { title: string }[] }) => (
    <section aria-label="Arquivos da aula">
      {materials.map((item) => item.title).join(", ")}
    </section>
  ),
}));
vi.mock("@/lib/media", () => ({
  useMedia: () => null,
  openMaterial: vi.fn(),
  uploadMaterial: vi.fn(),
  uploadMedia: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

async function openLesson(videoUrl: string | null) {
  const data = createDemoPortalData();
  data.lessons = data.lessons.map((lesson) => ({ ...lesson, video_url: videoUrl }));
  data.materials = [
    {
      id: "pdf",
      lesson_id: "demo-lesson-2",
      title: "PDF da aula atual",
      file_path: "lesson/demo-lesson-2/guia.pdf",
      url: null,
      position: 0,
      created_at: "2026-11-12T00:00:00Z",
    },
    {
      id: "other",
      lesson_id: "demo-lesson-1",
      title: "Arquivo de outra aula",
      file_path: "lesson/demo-lesson-1/guia.pdf",
      url: null,
      position: 0,
      created_at: "2026-11-12T00:00:00Z",
    },
  ];
  mock.load.mockResolvedValue(data);
  render(<PortalApp />);
  fireEvent.click(await screen.findByRole("button", { name: "Organizando sua Jornada" }));
}

describe("Aulas com arquivo ou vídeo", () => {
  it("substitui o espaço do vídeo pelo arquivo da aula quando não há vídeo", async () => {
    await openLesson(null);
    expect(await screen.findByRole("region", { name: "Arquivos da aula" })).toHaveTextContent(
      "PDF da aula atual",
    );
    expect(screen.queryByText("Vídeo não configurado")).not.toBeInTheDocument();
    expect(screen.queryByText("Arquivo de outra aula")).not.toBeInTheDocument();
  });
  it("preserva o player e mostra arquivos complementares uma única vez", async () => {
    await openLesson("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(await screen.findByTitle("Organizando sua Jornada")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(screen.getAllByRole("region", { name: "Arquivos da aula" })).toHaveLength(1);
  });
});
