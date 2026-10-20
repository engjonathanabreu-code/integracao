// Shared by initial registration and the saved resident's Documents tab.
export const MAX_DOCUMENTOS = 12;
export const MAX_TAMANHO_DOCUMENTO = 20 * 1024 * 1024;
export function selecionarDocumentos(lista, vagas = MAX_DOCUMENTOS) {
  const aceitos = [], recusados = [];
  for (const arquivo of Array.from(lista || [])) {
    if (!/^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif|tiff|bmp|avif))$/i.test(arquivo.type) && !/\.(pdf|jpe?g|png|webp|gif|heic|heif|tiff?|bmp|avif)$/i.test(arquivo.name)) {
      recusados.push(`${arquivo.name}: formato não aceito`);
    } else if (arquivo.size > MAX_TAMANHO_DOCUMENTO) {
      recusados.push(`${arquivo.name}: acima de 20 MB`);
    } else if (aceitos.length >= vagas) {
      recusados.push(`${arquivo.name}: limite de ${MAX_DOCUMENTOS} arquivos por vez`);
    } else aceitos.push(arquivo);
  }
  return { aceitos, erro: recusados.join('. ') };
}
