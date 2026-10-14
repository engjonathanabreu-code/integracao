const normalizar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const digitos = valor => String(valor || '').replace(/\D/g, '');
export function pessoasDocumentais(cadastro) {
  const pessoas = [{id:'requerente', papel:'requerente', path:'requerente', pessoa:cadastro.requerente},
    {id:'conjuge', papel:'conjuge', path:'conjuge', pessoa:cadastro.conjuge}];
  for (const [colecao, papel] of [['corequerentes','corequerente'], ['ocupantes','ocupante']]) {
    (cadastro[colecao] || []).forEach((item, index) => {
      if (!item.id) return; // Sem chave persistente não existe destino seguro.
      pessoas.push({id:`${colecao}:${item.id}`, papel, path:`${colecao}.${index}.pessoa`, pessoa:item.pessoa});
      if (colecao === 'corequerentes' && item.conjuge?.nome) pessoas.push({id:`${colecao}:${item.id}:conjuge`, papel:'conjuge de corequerente', path:`${colecao}.${index}.conjuge`, pessoa:item.conjuge});
    });
  }
  return pessoas.filter(x => x.pessoa?.nome);
}
export function destinoDocumento(resposta, cadastro, escolhido = '') {
  const pessoas = pessoasDocumentais(cadastro);
  if (escolhido) return pessoas.find(x => x.id === escolhido) || null;
  if (resposta.vinculo?.pertenceAoProcesso === 'nao' || ['terceiro','indefinido'].includes(resposta.pessoa)) return null;
  const cpf = digitos(resposta.campos?.cpf), nome = normalizar(resposta.campos?.nome);
  const candidatos = cpf ? pessoas.filter(x => digitos(x.pessoa.cpf) === cpf) : nome ? pessoas.filter(x => normalizar(x.pessoa.nome) === nome) : [];
  return candidatos.length === 1 ? candidatos[0] : null;
}
export function linhaDocumentalAtual(linha, cadastro) {
  if (!linha.pessoaId) return linha;
  const pessoa = pessoasDocumentais(cadastro).find(x => x.id === linha.pessoaId);
  return pessoa ? {...linha, path:`${pessoa.path}.${linha.campoPessoa}`} : null;
}
