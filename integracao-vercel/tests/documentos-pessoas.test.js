import test from 'node:test';
import assert from 'node:assert/strict';
import {destinoDocumento, pessoasDocumentais, linhaDocumentalAtual} from '../src/documentos-pessoas.js';
import {docOk} from '../src/requisitos-moradores.js';
const cadastro = () => ({requerente:{nome:'Pessoa Principal',cpf:'52998224725'},conjuge:{},ocupantes:[{id:'o1',pessoa:{nome:'Pessoa Ocupante',cpf:'11144477735'}},{id:'o2',pessoa:{nome:'Homônimo'}},{id:'o3',pessoa:{nome:'Homônimo'}}],corequerentes:[]});
test('documento de ocupante não é atribuído ao requerente',()=>{
 const c=cadastro();
 assert.equal(destinoDocumento({pessoa:'ocupante',campos:{cpf:'111.444.777-35'}},c).id,'ocupantes:o1');
 assert.equal(destinoDocumento({pessoa:'outro_familiar',campos:{nome:'Pessoa Ocupante'}},c).path,'ocupantes.0.pessoa');
 assert.equal(destinoDocumento({pessoa:'outro_familiar',campos:{}},c),null);
 assert.equal(destinoDocumento({pessoa:'indefinido',campos:{nome:'Pessoa Principal'}},c),null);
});
test('homônimos e CPF divergente exigem seleção e destino removido não recebe dados',()=>{
 const c=cadastro(),res={pessoa:'ocupante',campos:{nome:'Homônimo'}};
 assert.equal(destinoDocumento(res,c),null);
 assert.equal(destinoDocumento(res,c,'ocupantes:o2').id,'ocupantes:o2');
 assert.equal(destinoDocumento({campos:{nome:'Pessoa Principal',cpf:'99999999999'}},c),null);
 assert.equal(destinoDocumento(res,c,'ocupantes:ausente'),null);
 assert.equal(linhaDocumentalAtual({pessoaId:'ocupantes:ausente',campoPessoa:'nome'},c),null);
});
test('reordenação preserva pessoa pelo id e verificação de ocupante não supre documento principal',()=>{
 const c=cadastro();c.ocupantes.reverse();
 assert.equal(linhaDocumentalAtual({pessoaId:'ocupantes:o1',campoPessoa:'rg'},c).path,'ocupantes.2.pessoa.rg');
 assert.equal(pessoasDocumentais(c).length,4);
 assert.equal(docOk({docs:[{tipo:'identidade',status:'validado',pessoaId:'ocupantes:o1'}]},'identidade'),false);
 assert.equal(docOk({docs:[{tipo:'identidade',status:'validado'}]},'identidade'),true);
});
