import test from 'node:test';
import assert from 'node:assert/strict';
import {alterarFunil,funilVazio} from '../src/funil-institucional.js';
const contexto={institucionais:Array.from({length:5},(_,i)=>({id:`i${i}`,nome:`Prefeitura ${i}`})),municipios:[],nucleos:[],autor:'Pessoa fictícia',data:'2026-10-14T12:00:00Z'};
const cidade=(i,etapa='prospeccao')=>({tipo:'cidade',id:`c${i}`,nome:`Cidade ${i}`,uf:'SC',institucionalId:`i${i}`,etapa});
test('cadastro institucional independente de Clientes, relação 1:N sem teto de núcleos',()=>{
 const vazio=funilVazio(),snapshot=structuredClone(contexto);let f=alterarFunil(vazio,cidade(0),contexto);
 for(let i=0;i<30;i++)f=alterarFunil(f,{tipo:'nucleo',nucleoId:`n${i}`,cidadeId:'c0',nome:`Núcleo ${i}`,carteira:'reserva'},contexto);
 f=alterarFunil(f,{tipo:'nucleo',nucleoId:'n0',carteira:'venda'},contexto);
 assert.equal(f.nucleos.length,30);assert.ok(f.nucleos.every(n=>n.cidadeId==='c0'));assert.equal(f.nucleos[0].carteira,'venda');assert.equal(f.cidades[0].etapa,'carteiras');assert.equal(vazio.cidades.length,0);assert.deepEqual(contexto,snapshot);
});
test('Prospecção acompanha quatro municípios com vínculo institucional explícito',()=>{
 let f=funilVazio();for(let i=0;i<4;i++)f=alterarFunil(f,cidade(i),contexto);
 assert.throws(()=>alterarFunil(f,cidade(4),contexto),/quatro municípios/);
 assert.throws(()=>alterarFunil(f,{...cidade(4),institucionalId:'ausente'},contexto),/não encontrado/);
 assert.throws(()=>alterarFunil(f,{...cidade(4),institucionalId:null},contexto),/Vincule um cliente institucional/);
 assert.throws(()=>alterarFunil(f,{...cidade(4),municipioId:'m0'},contexto),/Novos vínculos/);assert.equal(f.cidades.length,4);
});
test('candidata legada mantém campos e histórico sem associação por nome',()=>{
 const base={versao:1,cidades:[{id:'c0',nome:'Cidade antiga',uf:'RS',municipioId:null,etapa:'nuvens',extra:'preservar'}],nucleos:[],historico:[{id:'hist',data:'2026-01-01'}]},original=structuredClone(base);
 const f=alterarFunil(base,{...base.cidades[0],tipo:'cidade',institucionalId:'i0',etapa:'prospeccao'},contexto);
 assert.equal(f.cidades[0].nome,'Cidade antiga');assert.equal(f.cidades[0].extra,'preservar');assert.equal(f.cidades[0].municipioId,null);assert.deepEqual(f.historico[0],base.historico[0]);assert.deepEqual(base,original);
});
test('núcleo legado preserva identificadores e município ao mover etapa',()=>{
 const base={versao:1,cidades:[{id:'c0',nome:'Cidade antiga',uf:'SC',municipioId:'m0',etapa:'carteiras'}],nucleos:[{nucleoId:'n0',municipioId:'m0',carteira:'reserva',extra:'preservar'}],historico:[]};
 const f=alterarFunil(base,{tipo:'nucleo',nucleoId:'n0',carteira:'venda'},contexto);assert.deepEqual(f.cidades,base.cidades);assert.deepEqual(f.nucleos,[{...base.nucleos[0],carteira:'venda'}]);assert.equal(base.nucleos[0].carteira,'reserva');
});
test('núcleos exigem Prospecção e preservam vínculo institucional com filhos',()=>{
 let f=alterarFunil(null,cidade(0,'nuvens'),contexto);
 assert.throws(()=>alterarFunil(f,{tipo:'nucleo',nucleoId:'n0',cidadeId:'c0',nome:'Núcleo',carteira:'reserva'},contexto),/Prospecção/);
 f=alterarFunil(f,cidade(0),contexto);f=alterarFunil(f,{tipo:'nucleo',nucleoId:'n0',cidadeId:'c0',nome:'Núcleo',carteira:'reserva'},contexto);
 assert.throws(()=>alterarFunil(f,{...cidade(0,'carteiras'),institucionalId:'i1'},contexto),/Preserve o vínculo/);
 assert.throws(()=>alterarFunil(f,{tipo:'nucleo',nucleoId:'n1',cidadeId:'c0',nome:'Núcleo',carteira:'reserva'},contexto),/já está/);
 assert.throws(()=>alterarFunil(f,{tipo:'nucleo',nucleoId:'n0',carteira:'invalida'},contexto),/etapa válida/);
});
