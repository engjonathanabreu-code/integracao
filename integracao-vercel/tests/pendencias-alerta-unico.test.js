import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

test('fila ativa tem só um indicador; divergência continua consultável e prévia encerrada some',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'integracao-alerta-unico-'));
 try{
  const arquivo=join(dir,'ui.cjs');
  await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
    import Aviso from './src/AvisoSincronizacao.jsx';import Pendencias from './src/PendenciasSincronizacao.jsx';
    export const render=sync=>renderToStaticMarkup(<><Aviso sync={sync}/><Pendencias sync={sync}/></>);`,
    resolveDir:fileURLToPath(new URL('../',import.meta.url)),sourcefile:'ui.jsx',loader:'jsx'},jsx:'automatic',bundle:true,platform:'node',format:'cjs',outfile:arquivo,logLevel:'silent'});
  const {render}=createRequire(import.meta.url)(arquivo);
  const item={id:'pendencia',estado:'bloqueado_conflito',tentativas:1,erro:{codigo:'PT409'},original:{modulo:'metas'}};
  const sync={status:'1 alteração aguardando revisão',error:'Abra Pendências para revisar cada alteração.',erroGlobal:'',pendencias:[item]};
  for(let i=0;i<4;i++){
   const html=render({...sync,pendencias:[{...item}]});
   assert.equal(html.match(/Pendências de sincronização \(1\)/g)?.length,1);
   assert.doesNotMatch(html,/role="alert"|Abra Pendências|alteração aguardando revisão/);
   assert.match(html,/Revisar esta alteração/);
  }
  const automatico=render({...sync,pendencias:[{...item,estado:'resultado_desconhecido'}]});
  assert.equal(automatico.match(/Retomar tentativas automáticas/g)?.length,1);
  assert.doesNotMatch(render(sync),/Retomar tentativas automáticas/);
  const previaPendencia={id:item.id,item,conflitos:[],edicoes:[]};
  assert.match(render({...sync,previaPendencia}),/Prévia da recuperação/);
  assert.doesNotMatch(render({...sync,previaPendencia,pendencias:[{...item,id:'outro'}]}),/Prévia da recuperação/);
  assert.equal(render({...sync,previaPendencia,pendencias:[],status:'Dados compartilhados no Supabase'}),'');
  for(const error of ['O navegador não conseguiu guardar uma alteração.','Entre novamente na mesma conta.','Uma parte da cópia não pôde ser exportada.']){
   const html=render({...sync,erroGlobal:error});
   assert.equal(html.match(/role="alert"/g)?.length,1);
   assert.ok(html.includes(error));assert.doesNotMatch(html,/alteração aguardando revisão/);assert.match(html,/Baixar cópia/);assert.match(html,/Revisar esta alteração/);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
