/* Modelo do memorial descritivo — Capítulo I, Anexo B.
   Segue a mesma convenção dos demais modelos do sistema: marcadores {{...}}
   substituídos pelo próprio sistema, papel timbrado aplicado na emissão. */

export const MODELO_MEMORIAL_DESCRITIVO = `
<p style="text-align:center"><strong>CAPÍTULO I - ANEXO B</strong></p>
<p style="text-align:center"><strong>MEMORIAL DESCRITIVO DA UNIDADE IMOBILIÁRIA {{unidade.codigo}}</strong></p>

<p><strong>DO REQUERENTE</strong></p>
<p style="text-align:justify">{{qualificacao.memorial}}</p>

<p><strong>DA UNIDADE IMOBILIÁRIA</strong></p>
<p style="text-align:justify">Identificação: Unidade Imobiliária {{unidade.codigo}}, situada no {{imovel.logradouro}}, {{imovel.numero}}, {{imovel.bairro}}, {{municipio.nome}}/{{municipio.uf}}, CEP: {{imovel.cep}}.</p>

<p><strong>ÁREA:</strong> {{unidade.area}} m² &nbsp;&nbsp;&nbsp;&nbsp; <strong>PERÍMETRO:</strong> {{unidade.perimetro}} m</p>

<p style="text-align:justify">Características: {{unidade.caracteristicas}}</p>

<p style="text-align:justify">{{unidade.memorial}}</p>

<p style="text-align:right">{{municipio.nome}}, {{documento.dataExtenso}}</p>

<p style="text-align:center">_____________________________________<br/>
RESPONSÁVEL TÉCNICO<br/>
{{responsavelTecnico.nome}}<br/>
{{responsavelTecnico.registro}}</p>
`.trim();

/* Marcadores usados, para a tela de ajuda do editor de modelos. */
export const MARCADORES_MEMORIAL = [
  { chave: "unidade.codigo", ajuda: "Código do processo da unidade imobiliária" },
  { chave: "qualificacao.memorial", ajuda: "Qualificação do requerente no formato do memorial" },
  { chave: "imovel.logradouro", ajuda: "Logradouro do imóvel" },
  { chave: "imovel.numero", ajuda: "Número do imóvel" },
  { chave: "imovel.bairro", ajuda: "Bairro ou localidade do imóvel" },
  { chave: "imovel.cep", ajuda: "CEP do imóvel" },
  { chave: "municipio.nome", ajuda: "Município do núcleo" },
  { chave: "municipio.uf", ajuda: "UF do município" },
  { chave: "unidade.area", ajuda: "Área calculada a partir dos vértices, em m²" },
  { chave: "unidade.perimetro", ajuda: "Perímetro calculado a partir dos vértices, em m" },
  { chave: "unidade.caracteristicas", ajuda: "Descrição das benfeitorias da unidade" },
  { chave: "unidade.memorial", ajuda: "Descrição dos vértices gerada na aba Memoriais" },
  { chave: "documento.dataExtenso", ajuda: "Data da emissão por extenso" },
  { chave: "responsavelTecnico.nome", ajuda: "Responsável técnico do levantamento" },
  { chave: "responsavelTecnico.registro", ajuda: "Registro profissional, ART ou RRT" },
];
