import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Coloca no sw.js a lista de arquivos gerados, para o sistema abrir sem internet já depois do primeiro acesso
function guardarParaOffline() {
  let arquivos = [];
  let falhou = false;
  return {
    name: "integracao-offline",
    apply: "build",
    buildEnd(erro) { falhou = !!erro; },
    generateBundle(_, bundle) {
      arquivos = Object.keys(bundle).filter((f) => !f.includes("mammoth")).map((f) => `/${f}`);
    },
    closeBundle() {
      if (falhou) return;
      const caminho = resolve("dist/sw.js");
      const versao = Date.now().toString(36);
      const texto = readFileSync(caminho, "utf8")
        .replace('"__ARQUIVOS__"', arquivos.map((a) => JSON.stringify(a)).join(", "))
        .replace(/const CACHE = "[^"]+";/, `const CACHE = "integracao-${versao}";`);
      writeFileSync(caminho, texto);
    },
  };
}

export default defineConfig({
  plugins: [react(), guardarParaOffline()],
  build: { chunkSizeWarningLimit: 2000 },
});
