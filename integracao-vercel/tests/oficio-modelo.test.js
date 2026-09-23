import test from 'node:test';
import assert from 'node:assert/strict';
import {novoOficio,htmlOficio,modeloOficio} from '../src/oficio-modelo.js';
test('modelo 309 conserva identificação, itens e assinatura sem vincular município ou processo',()=>{
 const f=novoOficio(null,'2026-09-23',null),h=htmlOficio(f);
 assert.equal(f.numero,309);assert.match(h,/309\/2026/);assert.match(h,/29.212.382\/0001-07/);assert.match(h,/MARCOS PAULO BAUCELLI/);assert.match(h,/23 de setembro de 2026/);
 for(const n of [1,2,3])assert.ok(h.includes(`${n}. `));
 assert.doesNotMatch(h,/Lontras|Ribeirão do Salto|1284\/2023|473\/2026|Data do protocolo/);
 assert.equal(novoOficio(null,'2026-09-23',450).numero,450);
 assert.equal(novoOficio(null,'2027-01-01',null).numero,1);
});
test('configuração integral reutilizada; referências opcionais escapadas nos documentos',()=>{
 const modelo={local:'Outra sede',destinatario:'Comissão',assunto:'Assunto editado',introducao:'Introdução editada',conteudo:'1. Conteúdo editado',encerramento:'Encerramento editado',assinatura:'Outra assinatura'};
 const f=novoOficio(modelo,'2026-09-23',310);
 for(const [k,v] of Object.entries(modelo))assert.equal(f[k],v);
 const h=htmlOficio({...f,referencia:'Ofício 88/2026 <script>',nucleo:'NUI & Teste',processo:'123/2026',protocolo:'2026-09-01'});
 assert.match(h,/Ofício 88\/2026 &lt;script&gt;/);assert.match(h,/NUI &amp; Teste/);assert.match(h,/01\/09\/2026/);assert.doesNotMatch(h,/<script>/);
 assert.equal(modeloOficio({introducao:null}).introducao,modeloOficio().introducao);
 assert.equal(novoOficio({numero:999},'2026-09-23',310).numero,310);
});
