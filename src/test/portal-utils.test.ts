import { describe, expect, it } from "vitest";
import { displayPlatformName, safeHttps, videoSource } from "@/lib/portal";

describe("Validação de URLs de conteúdo", () => {
  it("não permite URLs com protocolos inseguros", () => {
    expect(safeHttps("javascript:alert(1)")).toBeUndefined();
    expect(safeHttps("http://example.com")).toBeUndefined();
    expect(videoSource("javascript:alert(1)")).toBeNull();
  });
  it("reconhece vídeo direto e links externos HTTPS", () => {
    expect(videoSource("https://example.com/video.mp4")?.kind).toBe("video");
    expect(videoSource("https://example.com/watch")?.kind).toBe("external");
  });
  it("gera embed em domínio restrito para YouTube", () => {
    expect(videoSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "iframe",
      src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
  });
});

describe("Marca do portal", () => {
  it("exibe A ORDEM no lugar do nome inicial do template", () => {
    expect(displayPlatformName("Portal da Mentoria")).toBe("A ORDEM");
    expect(displayPlatformName(null)).toBe("A ORDEM");
  });
  it("preserva nomes personalizados pelo administrador", () => {
    expect(displayPlatformName("Minha Comunidade")).toBe("Minha Comunidade");
  });
});
