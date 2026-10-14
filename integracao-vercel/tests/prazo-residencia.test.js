import test from 'node:test';
import assert from 'node:assert/strict';
import {limiteResidencia,avaliarPrazoResidencia,regrasResidenciaPadrao,INSTRUCAO_RESIDENCIA_ANTIGA,INSTRUCAO_RESIDENCIA_SEIS_MESES} from '../src/prazo-residencia.js';
test('seis meses calendários incluem limite e ajustam fim de mês e ano bissexto',()=>{
 assert.equal(limiteResidencia('2026-10-14'),'2026-04-14');
 assert.equal(limiteResidencia('2026-08-31'),'2026-02-28');
 assert.equal(limiteResidencia('2024-08-31'),'2024-02-29');
 assert.equal(avaliarPrazoResidencia({emissao:'2026-04-14'},'2026-10-14').resultado,'atende');
 assert.equal(avaliarPrazoResidencia({emissao:'2026-04-13'},'2026-10-14').resultado,'nao_atende');
 assert.equal(avaliarPrazoResidencia({emissao:'2026-02-28'},'2026-08-31').resultado,'atende');
});
test('data futura não atende; ausente, inválida ou ilegível exige revisão humana',()=>{
 assert.equal(avaliarPrazoResidencia({emissao:'2026-10-15'},'2026-10-14').resultado,'nao_atende');
 for(const campos of [{},{emissao:'2026-02-30'},{emissao:'ilegível'}])assert.equal(avaliarPrazoResidencia(campos,'2026-10-14').resultado,'nao_verificada');
 assert.equal(avaliarPrazoResidencia({vencimento:'2026-10-01'},'2026-10-14').resultado,'atende');
});
test('só o padrão inalterado é atualizado; personalizações e resultados antigos são preservados',()=>{
 const padrao={id:'rg_residencia_90',instrucao:INSTRUCAO_RESIDENCIA_ANTIGA,tipos:['comp_residencia']};
 const custom={...padrao,instrucao:'Prazo específico de 30 dias.'},posse={id:'rg_posse_data',instrucao:'Data histórica de posse.',tipos:['comp_posse']};
 const fonte=[padrao,custom,posse,{...padrao,personalizada:true}];const resultado=regrasResidenciaPadrao(fonte);
 assert.equal(resultado[0].instrucao,INSTRUCAO_RESIDENCIA_SEIS_MESES);
 assert.equal(fonte[0].instrucao,INSTRUCAO_RESIDENCIA_ANTIGA);
 assert.equal(resultado[1],custom);assert.equal(resultado[2],posse);assert.equal(resultado[3],fonte[3]);
 const validado={tipo:'comp_residencia',status:'validado',regras:[{id:padrao.id,resultado:'atende'}]};const antes=JSON.stringify(validado);regrasResidenciaPadrao(fonte);assert.equal(JSON.stringify(validado),antes);
});
