import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {destinoDocumento,linhaDocumentalAtual} from '../src/documentos-pessoas.js';
import {avaliarPrazoResidencia,INSTRUCAO_RESIDENCIA_SEIS_MESES} from '../src/prazo-residencia.js';
const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const getPath=(o,p)=>p.split('.').reduce((x,k)=>x?.[k],o),setPath=(o,p,v)=>{const a=p.split('.');const k=a.pop();a.reduce((x,k)=>x[k]??=(/^\d+$/.test(k)?[]:{}),o)[k]=v;};
const extrair=x=>structuredClone(x),clone=structuredClone;
const deps={destinoDocumento,preenchido:v=>String(v??'').trim()!=='',getPath,normalizar:v=>String(v).toLowerCase(),so:v=>String(v).replace(/\D/g,''),MAPA_IA:{nome:{rot:'Nome',campo:'nome'},rg:{rot:'RG',campo:'rg'},logradouro:{rot:'Logradouro',path:'endereco.logradouro'}}};
const montarLinhas=new Function(...Object.keys(deps),source.slice(source.indexOf('function montarLinhas('),source.indexOf('/* ---------------- gerador de PRF'))+';return montarLinhas;')(...Object.values(deps));
const base=()=>({requerente:{nome:'Requerente Fictício'},conjuge:{},endereco:{},docs:[],ocupantes:[{id:'o1',pessoa:{nome:'Ocupante Fictício'}},{id:'o2',pessoa:{nome:'Outro Fictício'}}]});
test('linhas reais aplicam somente na pessoa identificada e resolvem reorder por ID',()=>{const p=base(),res={pessoa:'ocupante',campos:{nome:'Ocupante Fictício',rg:'RG-FICTICIO',logradouro:'Não copiar ao requerente'}};const linhas=montarLinhas(res,p);assert.equal(linhas.length,1);assert.equal(linhas[0].pessoaId,'ocupantes:o1');p.ocupantes.reverse();const atual=linhaDocumentalAtual(linhas[0],p);setPath(p,atual.path,atual.sugerido);assert.equal(p.ocupantes[1].pessoa.rg,'RG-FICTICIO');assert.equal(p.requerente.rg,undefined);assert.equal(p.endereco.logradouro,undefined);assert.deepEqual(montarLinhas({pessoa:'terceiro',campos:{nome:'Terceiro',rg:'x',logradouro:'x'}},p),[]);});
test('handler real do cadastro novo registra pessoa e prazo deterministico sem destino indefinido',()=>{
 const fn=source.slice(source.indexOf('  const aplicarAnalise = (np,'),source.indexOf('  const processarArquivo',source.indexOf('  const aplicarAnalise = (np,')));
 // Extract only the complete handler, before the following handler.
 const code=fn.slice(0,fn.indexOf('\n  };')+6);
 const d={DOC_TIPOS:{identidade:'Identidade',comp_residencia:'Residência'},destinoDocumento,extrair,montarLinhas,clone,setPath,regrasAplicaveis:r=>r,regrasDoMunicipio:()=>[{id:'rg_residencia_90',nome:'Prazo',instrucao:INSTRUCAO_RESIDENCIA_SEIS_MESES}],db:{},municipio:{id:'m1'},INSTRUCAO_RESIDENCIA_SEIS_MESES,avaliarPrazoResidencia,uid:()=> 'doc-ficticio',usuario:{nome:'Revisor fictício'}};
 const aplicar=new Function(...Object.keys(d),code+';return aplicarAnalise;')(...Object.values(d));
 const p=base();let r=aplicar(p,{tipo:'identidade',pessoa:'ocupante',campos:{nome:'Ocupante Fictício',rg:'RG-FICTICIO'}},false,{nome:'ficticio.png'});
 assert.equal(r.novo.docs[0].pessoaId,'ocupantes:o1');assert.equal(r.novo.ocupantes[0].pessoa.rg,'RG-FICTICIO');assert.equal(p.docs.length,0);
 r=aplicar(p,{tipo:'comp_residencia',pessoa:'requerente',campos:{nome:'Requerente Fictício',emissao:'1900-01-01'},regras:[{id:'rg_residencia_90',resultado:'atende'}]},false,{nome:'ficticio.png'});assert.equal(r.novo.docs[0].regras[0].resultado,'nao_atende');
});
