import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aparelhosComPendenciaParada,LIMITE_PENDENCIA_PARADA_MS} from '../src/diagnostico-sincronizacao.js';

const agora=Date.parse('2026-11-25T15:00:00Z'),h=3600000;
const usuarios=[{id:'u1',erpRef:'a',nome:'Ana',ativo:true},{id:'u2',erpRef:'b',nome:'Bruno',ativo:false}];
const relato=(usuario_id,instalacao_id,horas,resumo)=>({usuario_id,instalacao_id,versao:'v1',ultimo_contato:new Date(agora-horas*h).toISOString(),resumo});
const g=(modulo,quantidade,estado='pendente_local')=>({estado,modulo,codigo:'SEM_ERRO',quantidade});

test('USO-C4: lista só aparelho com pendência no último relato e sem contato há mais de 48 h',()=>{
 assert.equal(LIMITE_PENDENCIA_PARADA_MS,48*h);
 const relatos=[
  relato('a','11111111-aaaa',72,[g('arquivos',250),g('processos',3,'falha_transitoria')]),
  relato('a','22222222-aaaa',1,[g('arquivos',6)]),          // pendência, mas em contato: fora
  relato('b','33333333-bbbb',24*10,[g('metas',1)]),         // conta inativa continua visível
  relato('b','44444444-bbbb',24*30,[]),                     // parado, sem pendência: fora
  relato('z','55555555-zzzz',49,[g('arquivos',45)]),        // conta que não está na lista
  relato('a','66666666-aaaa',48,[g('arquivos',9)]),         // exatamente 48 h ainda não passou
  {usuario_id:'a',instalacao_id:'77777777-aaaa',versao:'v1',ultimo_contato:'inválido',resumo:[g('arquivos',1)]},
  relato('a','88888888-aaaa',96,[{modulo:'arquivos',quantidade:'7'},null]),
 ];
 const r=aparelhosComPendenciaParada(usuarios,relatos,agora);
 assert.deepEqual(r.map(x=>[x.nome,x.instalacao_id,x.dias,x.pendencias,x.arquivos]),[
  ['Bruno','33333333-bbbb',10,1,0],
  ['Ana','11111111-aaaa',3,253,250],
  ['Conta fora da lista de usuários','55555555-zzzz',2,45,45],
 ]);
 assert.deepEqual(aparelhosComPendenciaParada(usuarios,[],agora),[]);
 assert.deepEqual(aparelhosComPendenciaParada(null,null,agora),[]);
});

test('USO-C4: o painel é só leitura, para a Diretoria, sobre os relatos já consultados',()=>{
 const c=readFileSync(new URL('../src/DiagnosticoSincronizacao.jsx',import.meta.url),'utf8');
 assert.match(c,/if\(!habilitado\|\|usuario\.setor!=='diretoria'\)return null;/);
 assert.match(c,/aparelhosComPendenciaParada\(usuarios,relatos,agora\)/);
 assert.match(c,/Aparelhos com pendência há mais de 2 dias/);
 // Nenhuma consulta nova: a tabela continua lida uma vez (GET) e gravada uma vez (o próprio relato).
 assert.equal(c.split('integracao_sincronizacao_dispositivos').length,3);
 assert.equal(c.split('requisicao(').length,3);
});
