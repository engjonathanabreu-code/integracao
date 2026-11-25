// Dados sintéticos. Carrega do App.jsx as funções reais da tela (lista de documentos,
// conferência do que falta e qualificação) para os testes de bloqueio.
import fs from 'node:fs';
import vm from 'node:vm';
import {preenchido,ehPJ,temConjuge,normalizar,cpfValido,cnpjValido,so,COM_CONJUGE} from '../src/requisitos-moradores.js';
import {cpfDispensado} from '../src/pessoa-menor.js';
import {documentoPorDeclarante,opcoesDeclaracao} from '../src/declarantes-comerciais.js';
import {ENTRADA_PARCELADA,validarCondicoesVenda} from '../src/condicoes-venda.js';
import * as bloqueio from '../src/documentos-bloqueio.js';
const fonte=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const ctx={preenchido,ehPJ,temConjuge,normalizar,cpfValido,cnpjValido,so,COM_CONJUGE,cpfDispensado,documentoPorDeclarante,ENTRADA_PARCELADA,validarCondicoesVenda,...bloqueio,
 fmtCPF:x=>x,fmtCNPJ:x=>x,fmtCEP:x=>x,codigosUnidades:()=>['TESTE_0001']};
vm.createContext(ctx);
const fatia=(ini,fim)=>fonte.slice(fonte.indexOf(ini),fonte.indexOf(fim,fonte.indexOf(ini)));
vm.runInContext(fatia('const DOCS_COMERCIAIS = [','// Itens do termo de compromisso')+fatia('function faltandoPara(','const paragrafo =')+fatia('function gerarQualificacao(','// Blocos de qualificação guardados')
 +';this.docs=DOCS_COMERCIAIS;this.faltando=faltandoPara;this.gerar=gerarQualificacao;',ctx);
export const DOCS=Array.from(ctx.docs);
export const qualificar=p=>{const q=ctx.gerar(p,'completa');return {texto:q.texto,faltas:Array.from(q.faltas)};};
// O que a tela mostra em "Falta preencher" para o documento (mesma chamada de AbaComercialCliente).
export function faltaNaTela(tipo,p,{condicoes=condicoesOk(),advogados=[{id:'a1'}]}={}){
 const doc=DOCS.find(x=>x.id===tipo),d={condicoes,advogados,qualificacaoCompleta:qualificar(p).texto};
 const declarante=opcoesDeclaracao(p,tipo,DIA).find(x=>x.id==='requerente');
 return Array.from(ctx.faltando(doc,d,p,declarante));
}
export const DIA='2026-11-25';
export const condicoesOk=()=>({modalidade:'Entrada e parcelas',valorTotal:'6.000,00',entrada:'1.200,00',parcelas:'12',valorParcela:'400,00',diaVencimento:'10',primeiroVencimento:'2026-12-10',reajuste:'Sem reajuste'});
export const pessoa=(nome,cpf,extra={})=>({nome,cpf,nacionalidade:'Brasileira',estadoCivil:'Solteiro(a)',profissao:'Analista',rg:'1234567',mae:'Mãe de Teste',nascimento:'1980-05-10',...extra});
export const CPFS=['52998224725','11144477735','12345678909','39053344705'];
export const solteiro=()=>({id:'p1',codigo:'TESTE_0001',nucleoId:'n1',requerente:pessoa('Titular Teste',CPFS[0]),conjuge:{nome:'',cpf:''},corequerentes:[],ocupantes:[],
 endereco:{logradouro:'Rua A',numero:'10',bairro:'Centro',municipio:'Município Exemplo',uf:'SC',cep:'89140000'},social:{rendaFamiliar:'2000'},distrato:{registradoEm:'2026-11-01T10:00:00Z'}});
export const casado=()=>{const p=solteiro();p.requerente.estadoCivil='Casado(a)';p.requerente.regimeBens='Comunhão parcial de bens';p.conjuge=pessoa('Conjuge Teste',CPFS[1],{estadoCivil:'Casado(a)'});return p;};
export const empresa=()=>{const p=solteiro();p.requerente={tipoPessoa:'juridica',nome:'Empresa Teste Ltda',cnpj:'11222333000181',representante:'Sócio de Teste'};return p;};
