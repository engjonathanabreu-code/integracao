import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {temContatoMorador,alertaSemContatoMorador,ALERTA_SEM_CONTATO} from '../src/contato-morador.js';

test('USO-C3: contato exige ao menos um número utilizável; texto solto não conta',()=>{
 for(const ok of ['(47) 99999-1234','47999991234','3333-4444','+55 47 9 9999 1234'])assert.equal(temContatoMorador(ok),true,ok);
 for(const nao of ['',' ',null,undefined,'não tem','9999','(47)'])assert.equal(temContatoMorador(nao),false,String(nao));
 assert.equal(alertaSemContatoMorador('(47) 99999-1234'),'');
 assert.equal(alertaSemContatoMorador(''),`${ALERTA_SEM_CONTATO}\n\nContinuar mesmo assim?`);
 assert.match(alertaSemContatoMorador('9999'),/parece incompleto\.\n\nContinuar mesmo assim\?$/);
});

test('USO-C3: o novo morador pede o contato logo após o nome e só alerta ao continuar sem ele',()=>{
 const fonte=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const modal=fonte.slice(fonte.indexOf('function ModalMorador('),fonte.indexOf('function useCadastros('));
 const nome=modal.indexOf('htmlFor="mnomer"'),contato=modal.indexOf('htmlFor="mtel">WhatsApp ou telefone<'),cpf=modal.indexOf('htmlFor="mcpf"');
 assert.ok(nome>0&&nome<contato&&contato<cpf,'nome, depois contato, depois CPF');
 assert.equal(modal.split('id="mtel"').length,2,'um único campo de contato');
 const avancar=modal.slice(modal.indexOf('const avancar = () => {'),modal.indexOf('const escolherArquivos'));
 assert.match(avancar,/const semContato = alertaSemContatoMorador\(telefone\);\s+if \(semContato && !window\.confirm\(semContato\)\) return;\s+const np = montarMorador\(/);
 // Alerta, não bloqueio: a falta de contato não entra na lista que desabilita o botão.
 const erros=modal.slice(modal.indexOf('const erros = [];'),modal.indexOf('if (!remessas.length)'));
 assert.doesNotMatch(erros,/telefone|contato/i);
 assert.match(modal,/disabled=\{erros\.length > 0\}.{0,200}onClick=\{avancar\}/);
});
