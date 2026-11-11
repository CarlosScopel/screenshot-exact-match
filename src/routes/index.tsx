import { createFileRoute } from "@tanstack/react-router";
import { PortalApp } from "@/components/portal/Portal";

export const Route = createFileRoute("/")({
  component: PortalApp,
  head: () => ({
    meta: [
      { title: "Portal da Mentoria" },
      { name: "description", content: "Ambiente privado de treinamentos, conteúdos e ferramentas da mentoria." },
      { property: "og:title", content: "Portal da Mentoria" },
      { property: "og:description", content: "Área exclusiva de mentorados." },
    ],
  }),
});
