import test from 'node:test';import assert from 'node:assert/strict';
import {podeEditarOficios} from '../src/oficios-permissoes.js';
import {podeAnalisarDevolutiva} from '../src/metas-identidade.js';
import {htmlOficio,modeloOficio} from '../src/oficio-modelo.js';
import gerar from '../api/oficios-gerar.js';import analisar from '../api/oficios-analisar.js';
test('permissões de autoria e devolutiva por identificação canônica',()=>{
 for(const tipo of ['Projetos','Jurídico','Diretor Técnico','Diretor de Projetos','Administrador']){assert.ok(podeEditarOficios({tipo,ativo:true}));assert.ok(!podeEditarOficios({tipo,ativo:false}));}
 assert.ok(podeEditarOficios({tipoERP:'Topografia',setorERP:'Projetos',setor:'topografia'}));
 assert.ok(!podeEditarOficios({tipoERP:'Comercial',setor:'comercial'}));
 const meta={responsaveis:['erp_123']};
 assert.ok(podeAnalisarDevolutiva(meta,{id:'local',erpRef:'123',setor:'projeto'}));
 assert.ok(!podeAnalisarDevolutiva(meta,{id:'456',setor:'projeto'}));
 assert.ok(!podeAnalisarDevolutiva(meta,{id:'123',ativo:false}));
 assert.ok(podeAnalisarDevolutiva(null,{id:'789',setor:'diretoria'}));
 assert.ok(!podeAnalisarDevolutiva(null,{id:'123',setor:'projeto'}));
});
test('modelo preserva introdução e escapa conteúdo antes de converter documentos',()=>{
 const f={...modeloOficio({introducao:'Introdução configurada.'}),numero:42,data:'2026-09-22',destinatario:'Prefeitura de Teste',assunto:'Pedido',conteudo:'<script>alert(1)</script>\n\nSegundo parágrafo.',assinatura:'Pessoa\nCargo'};
 const html=htmlOficio(f);assert.ok(html.includes('042/2026'));assert.ok(html.includes('Introdução configurada.'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.throws(()=>htmlOficio({...f,conteudo:''}));
});
test('endpoints verificam sessão e perfil antes da IA e não aceitam respostas incompletas',async()=>{
 const original=global.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only';let perfil={tipo:'Projetos',setor:'Projetos',ativo:true},calls=0,stop='end_turn';
 global.fetch=async url=>{if(url.includes('/auth/'))return Response.json({id:'teste'});if(url.includes('/profiles?'))return Response.json([perfil]);if(url.includes('/storage/'))return new Response('Ofício solicitando documentos à prefeitura de teste.');calls++;return Response.json({status:stop==='max_tokens'?'incomplete':'completed',output:[{type:'message',content:[{type:'output_text',text:url.includes('api.openai.com')?'Conteúdo do ofício para revisão.':''}]}]});};
 const invoke=async(handler,body,authorization='Bearer token')=>{const res={setHeader(){},status(c){this.code=c;return this},json(x){this.data=x;return this}};await handler({method:'POST',headers:{authorization},body},res);return res};
 try{
 const body={assunto:'Solicitação',orientacao:'Solicitar documentos.'};
 assert.equal((await invoke(gerar,body,'')).code,401);
 assert.equal((await invoke(gerar,body)).code,200);assert.equal(calls,1);
 for(const p of [{tipo:'Comercial',ativo:true},{tipo:'Projetos',ativo:false}]){perfil=p;assert.equal((await invoke(gerar,body)).code,403);assert.equal((await invoke(analisar,{caminho:'00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/oficio.txt'})).code,403);}
 assert.equal(calls,1);perfil={tipo:'Jurídico',ativo:true};stop='max_tokens';assert.equal((await invoke(gerar,body)).code,422);
 assert.equal((await invoke(gerar,{...body,orientacao:'x'.repeat(10001)})).code,400);
 }finally{global.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
import {arquivosOriginaisDevolutiva} from '../src/metas-identidade.js';
test('devolutiva reutiliza original depois de sincronizar sem confundir corrigidos',()=>{
 const original={id:'1',nome:'Original.pdf',chave:'erp-storage|nova-chave',tipo:'application/pdf'},corrigido={id:'2',nome:'Corrigido.pdf',chave:'erp-storage|outra-chave',tipo:'application/pdf'};
 const meta={arquivos:[original,corrigido],devolutiva:{analiseIA:{etapa1:{arquivosAnalisados:[{nome:'Original.pdf',chave:'local-antiga'}]},etapa2:{arquivosAnalisados:[{nome:'Corrigido.pdf',chave:'local-antiga-2'}]}}}};
 assert.deepEqual(arquivosOriginaisDevolutiva(meta),[original]);
 meta.devolutiva.analiseIA.etapa1.arquivosAnalisados=[{id:'1',nome:'Nome antigo.pdf'}];assert.deepEqual(arquivosOriginaisDevolutiva(meta),[original]);
});
