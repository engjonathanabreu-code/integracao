import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
test('suporte fica apenas nas Configurações e executor é montado uma única vez fora do modo demo',()=>{
 const config=app.slice(app.indexOf('function PaginaConfig('),app.indexOf('/* ---------------- campo sem internet'));
 assert.match(config,/acessoSuporte\.operador && \["suporteRemoto", "Suporte remoto"/);
 assert.match(config,/atual === "suporteRemoto" && <SuporteRemoto usuario=\{usuario\} acesso=\{acessoSuporte\}/);
 assert.match(config,/pedida === "suporteRemoto" \? pedida/);
 assert.doesNotMatch(app,/navItem\([^\n]*"Suporte remoto"/);
 assert.equal(app.match(/<SuporteRemotoExecutor\b/g)?.length,1);
 assert.match(app,/!AMBIENTE\.DEMO && <><SuporteRemotoExecutor usuario=\{usuario\} sync=\{compartilhado\}/);
});
