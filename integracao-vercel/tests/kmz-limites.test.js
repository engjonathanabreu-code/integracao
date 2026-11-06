import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
import JSZip from 'jszip';
import {LIMITES_GEOGRAFIA} from '../geojson/geometria-geografica.js';

const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const no=parse(source,{sourceType:'module',plugins:['jsx']}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='extrairKMLdoKMZ');
assert.ok(no);
const criar=(descompressor=DecompressionStream)=>new Function('lerBytes','LIMITES_GEOGRAFIA','DecompressionStream',`${source.slice(no.start,no.end)};return extrairKMLdoKMZ;`)(arquivo=>arquivo.arrayBuffer(),LIMITES_GEOGRAFIA,descompressor);
const arquivo=bytes=>({size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
const zip=async(texto,compression='DEFLATE')=>{
  const z=new JSZip();z.file('arquivos/doc.kml',texto);return z.generateAsync({type:'uint8array',compression});
};
const centralKML=bytes=>{
  const b=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let pos=b.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
  while(pos>=0){const tamanho=b.readUInt16LE(pos+28),nome=b.subarray(pos+46,pos+46+tamanho).toString();if(/\.kml$/i.test(nome))return {b,pos};pos=b.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]),pos+46+tamanho);}
  throw new Error('Fixture sem KML');
};

test('KMZ preserva KML UTF-8 armazenado e compactado dentro do limite',async()=>{
  const texto='<?xml version="1.0" encoding="UTF-8"?><kml><Document><name>Núcleo — Área</name></Document></kml>';
  for(const compressao of ['STORE','DEFLATE'])assert.equal(await criar()(arquivo(await zip(texto,compressao))),texto);
});

test('KMZ rejeita tamanho de entrada antes de ler e confere tamanho real dos bytes',async()=>{
  let leu=false;
  await assert.rejects(criar()({size:LIMITES_GEOGRAFIA.bytes+1,arrayBuffer:async()=>{leu=true;return new ArrayBuffer(0);}}),/máximo 10 MB/);
  assert.equal(leu,false);
  await assert.rejects(criar()({size:1,arrayBuffer:async()=>new ArrayBuffer(LIMITES_GEOGRAFIA.bytes+1)}),/máximo 10 MB/);
});

test('KMZ rejeita tamanho expandido declarado antes de criar o descompressor',async()=>{
  const bytes=await zip('<kml/>'),{b,pos}=centralKML(bytes);b.writeUInt32LE(LIMITES_GEOGRAFIA.bytes+1,pos+24);
  let abriu=false;class Descompressor{constructor(){abriu=true;throw new Error('Não deveria descompactar');}}
  await assert.rejects(criar(Descompressor)(arquivo(bytes)),/máximo 10 MB/);assert.equal(abriu,false);
});

test('KMZ recusa bomba compactada mesmo com tamanho expandido falsificado',async()=>{
  const bytes=await zip('a'.repeat(LIMITES_GEOGRAFIA.bytes+20000));
  assert.ok(bytes.length<20000,'arquivo compactado é pequeno');
  const {b,pos}=centralKML(bytes);b.writeUInt32LE(10,pos+24);
  await assert.rejects(criar()(arquivo(bytes)),/máximo 10 MB/);
});

test('KMZ cancela a leitura assim que o stream passa do limite',async()=>{
  let cancelou=false,blocos=0;
  class DescompressorInstrumentado{
    constructor(){
      return {writable:new WritableStream(),readable:new ReadableStream({
        pull(controller){blocos++;controller.enqueue(new Uint8Array(1024*1024));},
        cancel(){cancelou=true;}
      })};
    }
  }
  await assert.rejects(criar(DescompressorInstrumentado)(arquivo(await zip('<kml/>'))),/máximo 10 MB/);
  assert.equal(cancelou,true);assert.ok(blocos<=12,`leitura limitada: ${blocos} blocos`);
});

test('KMZ truncado, criptografado, método estranho e tamanho divergente têm erro compreensível',async()=>{
  const base=await zip('<kml/>','STORE');
  await assert.rejects(criar()(arquivo(base.subarray(0,base.length-5))),/não parece um KMZ/);
  for(const [mudar,erro] of [
    [(b,p)=>b.writeUInt16LE(1,p+8),/sem senha/],
    [(b,p)=>b.writeUInt16LE(99,p+10),/não é suportada/],
    [(b,p)=>b.writeUInt32LE(1,p+24),/estrutura inválida/],
    [(b,p)=>b.writeUInt32LE(b.length+20,p+42),/estrutura inválida/]
  ]){const bytes=base.slice(),{b,pos}=centralKML(bytes);mudar(b,pos);await assert.rejects(criar()(arquivo(bytes)),erro);}
});
