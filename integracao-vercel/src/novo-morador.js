import {cpfValido,so,normalizar} from './requisitos-moradores.js';
import {normalizarCodigoMorador} from './codigo-morador.js';
// Conferência do primeiro passo de "Novo morador". `processos` é a lista visível
// (duplicidade de CPF e nome na remessa); `todos` inclui os arquivados, porque o
// código precisa ser único em toda a base.
export function conferirNovoMorador({remessaId,prefixoMunicipio,codigoGerado,nome,cpf,confirmaDup},processos,todos=processos){
  const cpfOk = cpfValido(cpf);
  const cpfDup = cpfOk && processos.find((p) => p.remessaId === remessaId && so(p.requerente.cpf) === so(cpf));
  const nomeDup = !cpfDup && nome.trim().length > 3 && processos.find((p) => p.remessaId === remessaId && normalizar(p.requerente.nome) === normalizar(nome));
  const erros = [];
  if (!remessaId) erros.push("Escolha a remessa");
  if (!prefixoMunicipio) erros.push("Cadastre o prefixo em Editar município antes de adicionar um morador");
  const codigoDuplicado = todos.some(p => normalizarCodigoMorador(p.codigo) === normalizarCodigoMorador(codigoGerado));
  if (codigoDuplicado) erros.push("Este código já existe. Confira o prefixo no cadastro do município.");
  else if (remessaId && prefixoMunicipio && !/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(normalizarCodigoMorador(codigoGerado))) erros.push(`O código ${codigoGerado} tem caracteres não aceitos. Use só letras sem acento e números no prefixo do município`);
  if (nome.trim().length < 3) erros.push("Informe o nome do requerente");
  if (!cpf) erros.push("Informe o CPF, ele é obrigatório");
  else if (!cpfOk) erros.push("CPF inválido, confira os dígitos");
  if (cpfDup && !confirmaDup) erros.push("Confirme o cadastro com CPF repetido");
  return {cpfOk,cpfDup,nomeDup,codigoDuplicado,erros};
}
