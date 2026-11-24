// C1/C5 (A5): pendências agrupadas pela causa raiz, transitórias atrasadas sem revisão,
// registro indisponível com mensagem clara e aviso discreto de sessão expirada.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

test('pendências: causa raiz, atraso automático, registro indisponível e sessão expirada',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'integracao-causa-raiz-'));
 try{
  const arquivo=join(dir,'ui.cjs');
  await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
    import Aviso from './src/AvisoSincronizacao.jsx';import Pendencias from './src/PendenciasSincronizacao.jsx';
    export const render=sync=>renderToStaticMarkup(<><Aviso sync={sync}/><Pendencias sync={sync}/></>);`,
    resolveDir:fileURLToPath(new URL('../',import.meta.url)),sourcefile:'ui.jsx',loader:'jsx'},jsx:'automatic',bundle:true,platform:'node',format:'cjs',outfile:arquivo,logLevel:'silent'});
  const {render}=createRequire(import.meta.url)(arquivo);
  const meta=(id,titulo)=>({modulo:'metas',dependencias:[],intencao:{edicoes:[{colecao:'metas',id,antes:{existe:false},depois:{existe:true,valor:{id,titulo}}}]}});
  const travado={id:'a',estado:'bloqueado_validacao',tentativas:1,dependencias:[],erro:{codigo:'P0001',status:400,categoria:'validacao',rejeicaoConfirmada:true},original:meta('m1','Regularizar núcleo')};
  const meio={id:'b',estado:'pendente_local',tentativas:0,dependencias:['a'],original:{...meta('m2','Filha'),dependencias:['a']}};
  const fim={id:'c',estado:'pendente_local',tentativas:0,dependencias:['b'],original:{...meta('m3','Neta'),dependencias:['b']}};
  const html=render({pendencias:[travado,meio,fim]});
  assert.equal(html.match(/aguardando metas “Regularizar núcleo”/g)?.length,2,'dependentes diretos e transitivos apontam a causa raiz');
  assert.match(html,/aria-label="Aguardando metas “Regularizar núcleo”"/);
  assert.match(html,/Pendências de sincronização \(3\)/);
  assert.doesNotMatch(html,/<details open/,'o painel não abre sozinho');

  const atrasado={id:'t',estado:'falha_transitoria',tentativas:9,falhas:8,proximaTentativa:Date.now()+60000,erro:{codigo:'TRANSPORTE',categoria:'transitoria'},original:meta('m4','Rede')};
  const html2=render({pendencias:[atrasado]});
  assert.match(html2,/atrasado \(tentando novamente automaticamente\)/);
  assert.doesNotMatch(html2,/Revisar esta alteração|Retomar tentativas automáticas/);
  const cedo=render({pendencias:[{...atrasado,falhas:7}]});
  assert.doesNotMatch(cedo,/atrasado/);

  const sumiu={id:'r',estado:'bloqueado_validacao',tentativas:1,erro:{codigo:'P0001',status:400,categoria:'registro_indisponivel',rejeicaoConfirmada:true},original:meta('m5','Apagada')};
  const html3=render({pendencias:[sumiu]});
  assert.match(html3,/Registro indisponível — recriar ou descartar/);
  assert.match(html3,/apagado ou ficou sem permissão/);
  assert.match(html3,/Revisar esta alteração/);

  const sessao=render({pendencias:[meio],avisoSessao:'Sessão expirada — entre novamente; suas alterações estão guardadas.'});
  assert.match(sessao,/role="status"[^>]*>Sessão expirada — entre novamente; suas alterações estão guardadas\./);
  assert.doesNotMatch(sessao,/role="alert"/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
