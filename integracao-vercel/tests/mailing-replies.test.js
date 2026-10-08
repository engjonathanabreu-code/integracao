import test from 'node:test';import assert from 'node:assert/strict';import {replyRecipients} from '../src/mailing-store.js';
test('responder recebido volta ao remetente',()=>assert.deepEqual(replyRecipients({from:'ana',to:['eu'],cc:[]},'eu'),['ana']));
test('responder mensagem enviada mantém destinatários originais',()=>assert.deepEqual(replyRecipients({from:'eu',to:['ana','bia'],cc:[]},'eu'),['ana','bia']));
test('responder a todos exclui a própria caixa, duplicados e cópias ocultas',()=>assert.deepEqual(replyRecipients({from:'ana',to:['eu','bia'],cc:['ana','carla'],bcc:['oculto']},'eu',true),['ana','bia','carla']));
