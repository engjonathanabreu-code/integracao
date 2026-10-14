import test from 'node:test';
import assert from 'node:assert/strict';
import {menorDeIdade, cpfDispensado} from '../src/pessoa-menor.js';
import {documentoValido, faltantesPessoa, faltantesQualificacao, criterioNucleo, contexto} from '../src/requisitos-moradores.js';
import {registrarVerificacaoHumana} from '../src/documentos-verificacao-humana.js';

test('CPF de menor: limite de 18 anos e nascimento inválido', () => {
 assert.equal(menorDeIdade({nascimento:'2008-10-14'},'2026-10-13'),true);
 assert.equal(menorDeIdade({nascimento:'2008-10-13'},'2026-10-13'),false);
 for(const nascimento of ['', '2020-02-30','2026-10-14','texto']) assert.equal(menorDeIdade({nascimento},'2026-10-13'),false);
 assert.equal(cpfDispensado({nascimento:'2020-01-01',cpf:'123'},'2026-10-13'),false);
});
test('requisitos dispensam somente CPF ausente de menor e preservam CNPJ', () => {
 const menor={nascimento:'2020-01-01',cpf:''};
 assert.equal(documentoValido(menor),true);
 assert.equal(documentoValido({...menor,cpf:'123'}),false);
 assert.equal(documentoValido({nascimento:'1980-01-01',cpf:''}),false);
 assert.equal(documentoValido({...menor,tipoPessoa:'juridica',cnpj:''}),false);
 assert.equal(faltantesPessoa(menor,true).includes('CPF'),false);
 assert.equal(faltantesQualificacao(menor).includes('CPF'),false);
});
const base=()=>({processo:{situacao:'Ativo',docs:[]},tipo:'comp_posse',justificativa:'Conferi o documento e as assinaturas.',usuario:{nome:'Pessoa de teste'},perm:{validarDocs:true},id:'teste',data:'2026-10-13T12:00:00Z'});
test('critério municipal prevalece sem apagar legado nem reenquadrar modalidade',()=>{
 const n={id:'n1',municipioId:'m1',criterio:{salarioMinimo:'1000',rendaMaxima:'3000'}};
 const db={nucleos:[n],processos:[],ajustesMunicipio:{m1:{criterioREURB:{salarioMinimo:'1500',rendaMaxima:'4500'}}}};
 assert.deepEqual(criterioNucleo(n,db),{sm:1500,teto:4500});
 assert.deepEqual(criterioNucleo({...n,municipioId:'m2'},db),{sm:1000,teto:3000});
 const p={id:'p1',nucleoId:'n1',municipioId:'m1',requerente:{},social:{modalidade:'REURB-E'}};
 assert.deepEqual(criterioNucleo(contexto(db,p).nucleo),{sm:1500,teto:4500});
 assert.equal(n.criterio.rendaMaxima,'3000');assert.equal(p.social.modalidade,'REURB-E');
});
test('verificação humana independente de IA é identificada e preserva o registro anterior',()=>{
 const args=base(),antes=structuredClone(args.processo),doc=registrarVerificacaoHumana(args);
 assert.equal(doc.status,'validado');assert.equal(doc.analiseIA,false);assert.equal(doc.origem,'verificação humana');
 assert.equal(doc.validadoPor,'Pessoa de teste');assert.deepEqual(doc.regras,[]);assert.deepEqual(args.processo,antes);
});
test('verificação humana preserva autorização, situação, justificativa e exceção da Diretoria',()=>{
 for(const args of [{...base(),perm:{}},{...base(),processo:{situacao:'Inativo'}},{...base(),justificativa:'x'}]) assert.throws(()=>registrarVerificacaoHumana(args));
 const args=base();args.processo.docs=[{id:'anterior',tipo:'comp_posse',regras:[{gravidade:'bloqueia',resultado:'nao_atende'}]}];
 assert.throws(()=>registrarVerificacaoHumana(args));
 args.perm.forcarValidacao=true;assert.equal(registrarVerificacaoHumana(args).documentoAnteriorId,'anterior');
});
