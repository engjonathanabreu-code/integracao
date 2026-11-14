import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {argumentosRelatorio,lerDocumentoFinanceiro} from '../src/financeiro-importacao.js';

test('relatório de pagamentos preserva CSV entre aspas e envia hash original, parcial e descontos',async()=>{
 const raw='pagador;codigo_processo;vencimento;data_pagamento;valor_pago;desconto;abatimento\r\n"Teste; ""Integral""";C-001;18/01/2026;20/01/2026;"50,01";"1,20";"0,30"';
 const file=new File([raw],'fixture.csv');
 const entries=await lerDocumentoFinanceiro(file,'pagamentos');
 assert.equal(entries[0].pagador,'Teste; "Integral"');
 const args=await argumentosRelatorio(file,entries);
 assert.equal(args.p_arquivo,createHash('sha256').update(raw).digest('hex'));
 assert.equal(args.p_itens[0].codigo_processo,'C-001');
 assert.equal(args.p_itens[0].valor_centavos,5001);
 assert.equal(args.p_itens[0].desconto_centavos,150);
 await assert.rejects(lerDocumentoFinanceiro(new File([raw],'fixture.xlsx'),'pagamentos'),/formato/);
});
