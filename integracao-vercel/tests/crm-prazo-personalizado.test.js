import test from 'node:test';import assert from 'node:assert/strict';
import {diasPrazoFollowup,diaFollowup,dataPrazoFollowup} from '../src/crm-followup.js';
test('calendário usa Brasília, atravessa meses e anos, rejeita datas e números inválidos',()=>{
 const agora=new Date('2026-12-31T23:30:00-03:00');
 assert.equal(diaFollowup(agora),'2026-12-31');assert.equal(dataPrazoFollowup(1,agora),'2027-01-01');
 assert.equal(diasPrazoFollowup({modo:'calendario',data:'2027-01-03'},agora),3);
 for(const data of ['2026-12-31','2026-12-30','2027-02-30','','inválida'])assert.equal(diasPrazoFollowup({modo:'calendario',data},agora),null);
 for(const dias of ['','0','-1','1.5','3651','abc'])assert.equal(diasPrazoFollowup({modo:'personalizado',dias},agora),null);
 for(const dias of ['1','3','15','3650'])assert.equal(diasPrazoFollowup({modo:'personalizado',dias},agora),Number(dias));
 for(const modo of ['1','2','4'])assert.equal(diasPrazoFollowup({modo},agora),Number(modo));
 assert.equal(diasPrazoFollowup({modo:'calendario',data:'2028-03-01'},new Date('2028-02-28T12:00:00-03:00')),2);
});
