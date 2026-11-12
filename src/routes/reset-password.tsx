import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AccessScreen } from "@/components/portal/AccessScreen";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  head: () => ({
    meta: [
      { title: "Definir senha | A ORDEM" },
      { name: "description", content: "Recupere seu acesso à mentoria A ORDEM e defina uma nova senha." },
      { property: "og:title", content: "Definir senha | A ORDEM" },
      { property: "og:description", content: "Recuperação segura de acesso à mentoria A ORDEM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ResetPassword() {
  const navigate = useNavigate();
  return <AccessScreen name="A ORDEM" forceRecovery onSuccess={() => void navigate({ to: "/" })} />;
}