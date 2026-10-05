const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
// Aba Hoje, funil enxuto (Avançar e arrastar), ficha lateral, alternador CRM Reurb / CRM Institucional, Dashboard e 390 px do CRM.
// Tudo roda no fixture do navegador (window.baseFixture): nenhuma rede, nenhum dado real. As gravações são conferidas nas requisições e no próprio fixture.
// Relógio fixo em 05/10/2026 12:00 (São Paulo, page.clock do Playwright 1.45 ou mais novo): atrasado, hoje e amanhã não dependem da hora em que o teste roda.
const URL_BASE='http://127.0.0.1:5178/tests/browser.html?crm',AGORA='2026-10-05T12:00:00-03:00';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const passo=async(nome,fn)=>{try{await fn();console.log('PASS',nome);}catch(e){e.message=`[${nome}] ${e.message}`;throw e;}};
// Cartões de apoio. Status antigos ('Novo', 'Contato feito', 'Proposta enviada', 'Cliente Ativo', vazio, 'Legado X', 'perdido') só existem para provar a exibição: nada é migrado.
async function semear(p){await p.evaluate(()=>{const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,B=window.baseFixture;
 const c=(n,o)=>B.integracao_crm_cards.push({id:id(n),responsavel_id:id(70),origem:'manual',municipio:'Município teste',municipio_id:id(2),cliente_id:id(1000+n),cpf_cnpj:'52998224725',...o});
 c(910,{nome:'Cliente Atrasado',telefone:'47911110001',status:'Negociação',valor_total:12000,forma_negociacao:'parcelado',parcelas:10});
 c(911,{nome:'Cliente Hoje',telefone:'47911110002',status:'Contrato',valor_total:30000,forma_negociacao:'avista',desconto_percentual:5});
 c(912,{nome:'Cliente Contrato SemCPF',telefone:'47911110003',cpf_cnpj:null,status:'Contrato',valor_total:1000,forma_negociacao:'avista',desconto_percentual:0});
 c(913,{lead_nome:'Lead Negociacao',lead_telefone:'47911110004',cliente_id:null,cpf_cnpj:null,municipio:null,municipio_id:null,status:'Negociação',valor_total:5000,forma_negociacao:'parcelado',parcelas:5});
 c(914,{nome:'Cliente Valor Sem Forma',telefone:'47911110005',status:'Cliente novo',valor_total:900});
 c(915,{nome:'Cliente Ativo Antigo',telefone:'47911110006',status:'Cliente Ativo'});
 c(916,{nome:'Cliente Status Novo',telefone:'47911110007',status:'Novo'});
 c(917,{nome:'Cliente Contato Feito',telefone:'47911110008',status:'Contato feito'});
 c(918,{nome:'Cliente Proposta',telefone:'47911110009',status:'Proposta enviada',valor_total:2000,forma_negociacao:'avista',desconto_percentual:0});
 c(919,{nome:'Cliente Status Vazio',telefone:'47911110010',status:''});
 c(920,{nome:'Cliente Status Estranho',telefone:'47911110011',status:'Legado X'});
 c(921,{nome:'Cliente Perdido Antigo',telefone:'47911110012',status:'perdido'});
 c(922,{lead_nome:'Lead Sem Responsavel',lead_telefone:'',cliente_id:null,cpf_cnpj:null,municipio:null,municipio_id:null,status:'Cliente novo',responsavel_id:null,responsaveis_ids:[]});
 c(923,{nome:'Cliente da Bia',telefone:'47911110013',status:'Cliente novo',responsavel_id:id(71)});
 // 03/10 15:00Z = atrasado há 2 dias; 05/10 20:00Z = hoje (17:00); 06/10 15:00Z = amanhã (fora da fila).
 B.integracao_crm_followups.push({id:id(930),card_id:id(910),status:'pendente',previsto_em:'2026-10-03T15:00:00Z',prazo_dias:1,criado_em:'2026-10-02T15:00:00Z'},{id:id(931),card_id:id(911),status:'pendente',previsto_em:'2026-10-05T20:00:00Z',prazo_dias:1,criado_em:'2026-10-04T15:00:00Z'},{id:id(932),card_id:id(913),status:'pendente',previsto_em:'2026-10-06T15:00:00Z',prazo_dias:2,criado_em:'2026-10-04T15:00:00Z'});
 B.integracao_crm_tarefas.push({id:id(940),card_id:id(910),titulo:'Enviar minuta do contrato',prazo:'2026-10-03',checklist:[],concluida:false,responsavel_id:id(70)},{id:id(941),card_id:id(911),titulo:'Conferir documentos',prazo:'2026-10-05',checklist:[],concluida:false,responsavel_id:id(70)},{id:id(942),card_id:id(913),titulo:'Ligar de novo para o lead',prazo:'2026-10-09',checklist:[],concluida:false,responsavel_id:id(70)});
 });}
// Cliente ativo com FollowUp nas próximas 24h (coluna Follow Up do Comercial). O dono é o usuário do fixture (perfil 0), como o Morador Teste do ?agentecomercial.
async function semearAtivo(p){await p.evaluate(()=>{const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,B=window.baseFixture,dono=B.profiles[0].id;
 B.integracao_crm_cards.push({id:id(950),responsavel_id:dono,responsaveis_ids:[dono],origem:'manual',municipio:'Município teste',municipio_id:id(2),cliente_id:id(1950),cpf_cnpj:'52998224725',nome:'Cliente Ativo Com FollowUp',telefone:'47911110020',status:'Cliente ativo',valor_total:8000,forma_negociacao:'avista',desconto_percentual:0});
 B.integracao_crm_followups.push({id:id(951),card_id:id(950),status:'pendente',previsto_em:'2026-10-05T16:00:00-03:00',prazo_dias:1,criado_em:'2026-10-04T15:00:00Z'});});}
// Abre o CRM como administrador (padrão) ou como o perfil do query. Registra toda requisição que não é leitura em window.escritas.
async function abrir(b,{query='',largura=1440,altura=1000,dados=true,cadastros=null,clientes=null,ativoComFollowup=false,preferencia=null}={}){
 const ctx=await b.newContext({viewport:{width:largura,height:altura},permissions:['clipboard-read','clipboard-write']}),p=await ctx.newPage();p.setDefaultTimeout(15000);p.erros=[];p.on('pageerror',e=>p.erros.push(e.message));
 await p.clock.setFixedTime(new Date(AGORA));if(preferencia)await p.addInitScript(([k,v])=>localStorage.setItem(k,v),preferencia);
 await p.goto(URL_BASE+query+(largura<600?'&mobile':''));
 await p.evaluate(([cadastros,clientes])=>{const original=window.fetch;window.escritas=[];window.leituras=[];window.falharPatch=false;window.atrasoPatch=0;window.cadastros=cadastros;window.clientesFin=clientes;
  window.fetch=async(input,options={})=>{const u=String(input),m=(options.method||'GET').toUpperCase();
   if(m!=='GET')window.escritas.push({m,u,b:options.body||null});else window.leituras.push(u);
   if(m==='PATCH'&&u.includes('integracao_crm_cards')){if(window.atrasoPatch)await new Promise(r=>setTimeout(r,window.atrasoPatch));if(window.falharPatch)return new Response(JSON.stringify({message:'Falha simulada'}),{status:500,headers:{'Content-Type':'application/json'}});}
   if(window.cadastros&&u.includes('integracao_moradores?select')&&u.includes('status_crm'))return new Response(JSON.stringify(window.cadastros),{status:200,headers:{'Content-Type':'application/json'}});
   if(window.clientesFin&&u.includes('fin_receb_clientes?select')&&u.includes('ativo'))return new Response(JSON.stringify(window.clientesFin),{status:200,headers:{'Content-Type':'application/json'}});
   return original(input,options);};},[cadastros,clientes]);
 if(dados)await semear(p);
 if(ativoComFollowup)await semearAtivo(p);
 await p.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await p.getByLabel('Senha',{exact:true}).fill('fixture');await p.getByRole('button',{name:'Entrar',exact:true}).click();
 if(largura<600)await p.getByRole('button',{name:'Abrir menu',exact:true}).click();
 await p.getByRole('navigation').getByRole('button',{name:'CRM',exact:true}).click();await p.getByRole('button',{name:'Cadastrar lead',exact:true}).waitFor();await p.waitForTimeout(300);await p.evaluate(()=>{window.escritas=[];});return p;}
const aba=(p,nome)=>p.getByRole('group',{name:'Seções do CRM'}).getByRole('button',{name:nome,exact:true}),abaHoje=p=>p.getByRole('group',{name:'Seções do CRM'}).getByRole('button',{name:/^Hoje/});
const escritas=p=>p.evaluate(()=>window.escritas),limpar=p=>p.evaluate(()=>{window.escritas=[];});
// Gravação = qualquer requisição que não é leitura. Ficam de fora o login e as RPCs que só leem (eventos, contagens, diretório, ponto, Dashboard, Metas e relatório de ativados).
const gravacoes=async p=>(await escritas(p)).filter(e=>!/\/auth\/v1\/|\/rpc\/(integracao_eventos|integracao_contagens_clientes|erp_collab_directory|integracao_registrar_acesso|integracao_ponto|integracao_crm_dashboard|integracao_crm_metas_painel|integracao_crm_relatorio_ativacoes)(\?|$)/.test(e.u));
const patches=async p=>(await escritas(p)).filter(e=>e.m==='PATCH'&&e.u.includes('integracao_crm_cards'));
const cartoesFixture=p=>p.evaluate(()=>JSON.stringify(window.baseFixture.integracao_crm_cards));
const linha=(p,nome)=>p.locator('article.crm-hf-linha').filter({has:p.getByRole('button',{name:`Abrir ficha de ${nome}`,exact:true})});
const coluna=(p,etapa)=>p.locator('section.crm-hf-coluna:not(.crm-followup-coluna)').filter({has:p.getByRole('heading',{name:new RegExp(`^${etapa} · \\d+$`)})});
const cartao=(p,nome)=>p.locator('article.crm-hf-cartao').filter({has:p.getByRole('button',{name:`Abrir ficha de ${nome}`,exact:true})});
const semRolagem=async(p,nome)=>{const r=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,corpo:document.body.scrollWidth}));assert.ok(r.sw<=r.iw&&r.corpo<=r.iw,`${nome}: rolagem horizontal ${JSON.stringify(r)}`);};
const alvosPequenos=p=>p.evaluate(()=>{const r=[];document.querySelectorAll('.crm-pagina button,.crm-pagina summary,.crm-pagina select,.crm-pagina input').forEach(e=>{const b=e.getBoundingClientRect();if(b.width&&b.height&&(b.height<39.5||b.width<39.5)&&getComputedStyle(e).visibility!=='hidden')r.push(`${(e.getAttribute('aria-label')||e.textContent||e.tagName).slice(0,40)} ${Math.round(b.width)}x${Math.round(b.height)}`);});return r;});
// Ficha lateral: ordem de tabulação x ordem visual (WCAG 2.4.3), alvos de toque, texto de apoio e contraste dos rótulos. Mede só o que está visível.
const medirFicha=p=>p.evaluate(()=>{const d=document.querySelector('dialog.crm-ficha-lateral'),corpo=d.querySelector('.crm-ficha-corpo'),topoCorpo=corpo.getBoundingClientRect().top-corpo.scrollTop;
 const visivel=e=>{const b=e.getBoundingClientRect(),c=getComputedStyle(e);return b.width>0&&b.height>0&&c.visibility!=='hidden'&&c.display!=='none';};
 const nome=e=>(e.getAttribute('aria-label')||e.textContent||e.tagName).trim().slice(0,40);
 const focaveis=[...d.querySelectorAll('button,select,input:not([type=hidden]),textarea,summary,a[href]')].filter(e=>!e.disabled&&visivel(e)&&e.closest('details:not([open])')?.querySelector('summary')===e||(!e.disabled&&visivel(e)&&!e.closest('details:not([open])')));
 const ordem=[];let anterior=-1;for(const e of focaveis){if(e.closest('.crm-ficha-fechar')||e.classList.contains('crm-ficha-fechar'))continue;const y=e.getBoundingClientRect().top-topoCorpo;if(y<anterior-1)ordem.push(`${nome(e)} (${Math.round(y)}) vem depois de ${Math.round(anterior)}`);anterior=Math.max(anterior,y);}
 const pequenos=[...d.querySelectorAll('button,select,input:not([type=hidden]),textarea,summary')].filter(e=>visivel(e)&&(e.getBoundingClientRect().height<39.5)).map(e=>`${nome(e)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
 const fontes=[],w=document.createTreeWalker(d,NodeFilter.SHOW_TEXT),vistos=new Set();let n;while(n=w.nextNode()){const t=n.textContent.trim(),e=n.parentElement;if(!t||vistos.has(e)||!visivel(e))continue;vistos.add(e);const f=parseFloat(getComputedStyle(e).fontSize);if(f<12.99)fontes.push(`${f}px ${t.slice(0,30)}`);}
 const lum=c=>{const [r,g,b]=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});return .2126*r+.7152*g+.0722*b;},rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
 const fundo=getComputedStyle(d).backgroundColor,contrastes=[...d.querySelectorAll('.crm-ficha-dados dt,.crm-ficha-cabeca p,.crm-negociacao label')].filter(visivel).map(e=>{const a=lum(rgb(getComputedStyle(e).color)),b=lum(rgb(fundo));return {t:nome(e),r:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};}).filter(c=>c.r<4.5).map(c=>`${c.t} ${c.r.toFixed(2)}`);
 return {ordem,pequenos,fontes,contrastes,total:focaveis.length};});
// Arrastar de verdade (mouse em vários passos). Fica com o botão pressionado sobre a coluna de destino para conferir o destaque antes de soltar.
async function arrastar(p,origem,destino,{soltar=true}={}){await p.setViewportSize({width:1440,height:2600});await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(150);const a=await origem.boundingBox(),t=await destino.boundingBox();assert.ok(a&&t&&a.y>=0&&t.y>=0,'origem e destino visíveis '+JSON.stringify([a,t]));
 await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(a.x+a.width/2+8,a.y+a.height/2+8,{steps:3});await p.mouse.move(t.x+t.width/2,t.y+70,{steps:15});
 if(soltar)await soltarArraste(p);}
async function soltarArraste(p){await p.mouse.up();await p.setViewportSize({width:1440,height:1000});}
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
 // ---------- 1. Hoje (administração, 1440 px) ----------
 let p=await abrir(b);
 await passo('Hoje é a aba inicial: cabeçalho, resumo, selo e grupos pela urgência',async()=>{
  assert.equal(await abaHoje(p).getAttribute('aria-current'),'true');
  await p.getByRole('heading',{name:'Você tem 2 contatos para resolver',exact:true}).waitFor();
  for(const t of ['Atrasados · 1','Para hoje · 1','Sem próximo passo · 11'])await p.getByRole('heading',{name:t,exact:true}).waitFor();
  assert.match(await abaHoje(p).innerText(),/2/);
  const resumo=await p.locator('dl.crm-hf-resumo').innerText();assert.match(resumo,/Valor em aberto[\s\S]*R\$\s50\.900,00/);assert.match(resumo,/\(8 sem valor\)/);assert.match(resumo,/Tarefas vencidas ou para hoje[\s\S]*2/);
  assert.equal(await p.getByRole('button',{name:'Cadastrar lead',exact:true}).count(),1);assert.equal(await p.getByRole('alert').count(),0);
  assert.equal(await p.getByRole('navigation').count(),1,'o menu lateral continua sendo o único landmark navigation');});
 await passo('Hoje: linhas com ficha, telefone, próximo passo e tarefa',async()=>{
  const a=linha(p,'Cliente Atrasado');assert.match(await a.innerText(),/Atrasado há 2 dias/);assert.match(await a.innerText(),/Previsto para 03\/10\/2026/);assert.match(await a.innerText(),/Tarefa: Enviar minuta do contrato · prazo 03\/10\/2026/);assert.match(await a.innerText(),/Negociação/);
  await a.getByRole('button',{name:'Registrar FollowUp feito · Cliente Atrasado',exact:true}).waitFor();assert.match(await linha(p,'Cliente Hoje').innerText(),/Hoje[\s\S]*Previsto para 05\/10\/2026/);
  const sem=linha(p,'Morador Teste');await sem.getByRole('button',{name:'Agendar FollowUp · Morador Teste',exact:true}).waitFor();assert.match(await sem.innerText(),/Escolha quando falar com este cliente/);
  assert.equal(await linha(p,'Lead Negociacao').count(),0,'passo de amanhã fica fora da fila');
  assert.equal(await p.locator('.crm-hf-linha').count(),13);});
 await passo('Hoje: cadastros em etapas antigas ou sem etapa aparecem na etapa correta, com pendência discreta',async()=>{
  const apoio=async n=>(await linha(p,n).innerText());
  assert.match(await apoio('Cliente Status Novo'),/Cliente novo/);assert.match(await apoio('Cliente Contato Feito'),/Cliente novo/);assert.match(await apoio('Cliente Proposta'),/Negociação/);assert.match(await apoio('Cliente Proposta'),/R\$\s2\.000,00/);
  assert.match(await apoio('Cliente Status Vazio'),/Sem etapa definida/);assert.match(await apoio('Cliente Status Estranho'),/Etapa "Legado X" tratada como Cliente novo/);
  assert.match(await apoio('Cliente Contrato SemCPF'),/Sem CPF/);assert.match(await apoio('Lead Sem Responsavel'),/Sem telefone/);assert.match(await apoio('Lead Sem Responsavel'),/Sem responsável/);
  for(const n of ['Cliente Ativo Antigo','Cliente Perdido Antigo'])assert.equal(await linha(p,n).count(),0,`${n} não é fila`);});
 await passo('Hoje: filtros rápidos (Atrasados, Para hoje, Sem próximo passo, Todos)',async()=>{
  const chips=p.getByRole('group',{name:'Filtros rápidos'}),chip=n=>chips.getByRole('button',{name:new RegExp(`^${n}`)});
  assert.equal(await chip('Todos').getAttribute('aria-pressed'),'true');await chip('Atrasados').click();assert.equal(await chip('Atrasados').getAttribute('aria-pressed'),'true');await p.getByRole('heading',{name:'Atrasados · 1',exact:true}).waitFor();assert.equal(await p.getByRole('heading',{name:/^(Para hoje|Sem próximo passo) · /}).count(),0);
  await chip('Para hoje').click();await p.getByRole('heading',{name:'Para hoje · 1',exact:true}).waitFor();assert.equal(await p.locator('.crm-hf-linha').count(),1);
  await chip('Sem próximo passo').click();await p.getByRole('heading',{name:'Sem próximo passo · 11',exact:true}).waitFor();assert.equal(await p.locator('.crm-hf-linha').count(),11);
  await chip('Todos').click();assert.equal(await p.locator('.crm-hf-linha').count(),13);});
 await passo('Hoje: busca e filtro por responsável (Ana, Bia, Sem responsável)',async()=>{
  const busca=p.getByLabel('Buscar no CRM'),sel=p.getByLabel('Filtrar comercial',{exact:true});
  await busca.fill('proposta');await p.getByRole('heading',{name:'Sem próximo passo · 1',exact:true}).waitFor();await linha(p,'Cliente Proposta').waitFor();await busca.fill('47911110001');await linha(p,'Cliente Atrasado').waitFor();assert.equal(await p.locator('.crm-hf-linha').count(),1);await busca.fill('');
  await sel.selectOption({label:'Bia Comercial'});await linha(p,'Cliente da Bia').waitFor();assert.equal(await p.locator('.crm-hf-linha').count(),1);await p.getByRole('heading',{name:'Dia em dia',exact:true}).waitFor();
  await sel.selectOption({label:'Sem responsável'});await linha(p,'Lead Sem Responsavel').waitFor();assert.equal(await p.locator('.crm-hf-linha').count(),1);
  await sel.selectOption({label:'Ana Comercial'});await p.getByRole('heading',{name:'Você tem 2 contatos para resolver',exact:true}).waitFor();assert.equal(await p.locator('.crm-hf-linha').count(),11);assert.equal(await linha(p,'Cliente da Bia').count(),0);
  await sel.selectOption('');assert.equal(await p.locator('.crm-hf-linha').count(),13);});
 await passo('Hoje: Copiar telefone avisa e copia o número',async()=>{await linha(p,'Cliente Atrasado').getByRole('button',{name:'Copiar telefone de Cliente Atrasado',exact:true}).click();await p.getByText('Telefone copiado.',{exact:true}).waitFor();assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),'47911110001');assert.equal((await gravacoes(p)).length,0);});
 await passo('Hoje: Registrar FollowUp feito abre a ficha lateral no FollowUp, sem gravar',async()=>{
  const antes=await cartoesFixture(p);await linha(p,'Cliente Atrasado').getByRole('button',{name:'Registrar FollowUp feito · Cliente Atrasado',exact:true}).click();
  const d=p.getByRole('dialog');await d.waitFor();assert.equal(await d.getAttribute('aria-label'),'Ficha de Cliente Atrasado');await d.getByLabel('Novo prazo de FollowUp',{exact:true}).waitFor();
  assert.equal((await gravacoes(p)).length,0);assert.equal(await cartoesFixture(p),antes);await d.getByRole('button',{name:'Fechar ficha',exact:true}).click();await d.waitFor({state:'detached'});});
 await passo('Hoje: concluir o FollowUp pela ficha tira o cliente de Atrasados',async()=>{
  await linha(p,'Cliente Atrasado').getByRole('button',{name:'Registrar FollowUp feito · Cliente Atrasado',exact:true}).click();const d=p.getByRole('dialog');
  await d.getByLabel('Novo prazo de FollowUp',{exact:true}).selectOption('4');await d.getByRole('checkbox',{name:'Confirmo que este FollowUp foi feito'}).check();await d.getByLabel('Resumo do último FollowUp').fill('Cliente confirmou interesse e pediu a minuta.');await d.getByRole('button',{name:'Concluir e agendar próximo',exact:true}).click();
  await d.getByText('FollowUp concluído e próximo prazo agendado.',{exact:true}).waitFor();await d.getByRole('button',{name:'Fechar ficha',exact:true}).click();await d.waitFor({state:'detached'});
  await p.getByRole('heading',{name:'Você tem 1 contato para resolver',exact:true}).waitFor();assert.equal(await p.getByRole('heading',{name:/^Atrasados · /}).count(),0);assert.equal(await linha(p,'Cliente Atrasado').count(),0);});
 await passo('Hoje: Ver tarefas leva às Tarefas abertas em grupos e Concluir tarefa grava só a conclusão',async()=>{
  await p.getByRole('button',{name:'Ver tarefas',exact:true}).click();assert.equal(await aba(p,'Tarefas abertas').getAttribute('aria-current'),'true');
  for(const t of ['Atrasadas · 1','Para hoje · 1','Próximas · 1'])await p.getByRole('heading',{name:t,exact:true}).waitFor();
  const t=p.locator('article.crm-card').filter({hasText:'Enviar minuta do contrato'});assert.match(await t.innerText(),/Prazo: 03\/10\/2026/);assert.match(await t.innerText(),/Cliente Atrasado · Ana Comercial/);
  await limpar(p);await t.getByRole('button',{name:'Concluir tarefa',exact:true}).click();await p.getByRole('heading',{name:'Atrasadas · 1',exact:true}).waitFor({state:'detached'});
  const w=(await gravacoes(p)).filter(e=>e.m!=='GET');assert.equal(w.length,1);assert.equal(w[0].m,'PATCH');assert.match(w[0].u,/integracao_crm_tarefas/);assert.deepEqual(JSON.parse(w[0].b),{concluida:true});
  await p.getByRole('heading',{name:'Para hoje · 1',exact:true}).waitFor();await abaHoje(p).click();await p.getByRole('heading',{name:'Você tem 1 contato para resolver',exact:true}).waitFor();});
 await passo('sem erro de página em Hoje e nas Tarefas',async()=>{assert.deepEqual(p.erros,[]);});
 await p.close();
 // ---------- 2. Funil enxuto (administração, 1440 px) ----------
 p=await abrir(b);await aba(p,'Funil comercial').click();
 await passo('Funil: visão padrão Reduzido, cartão enxuto sem formulário e colunas "Etapa · N" sem Cliente ativo',async()=>{
  assert.equal(await p.getByRole('button',{name:'Reduzido',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await p.getByRole('form',{name:/^Negociação de /}).count(),0);
  for(const t of ['Cliente novo · 9','Negociação · 3','Contrato · 2'])await p.getByRole('heading',{name:t,exact:true}).waitFor();assert.equal(await p.getByRole('heading',{name:/^Cliente ativo · /}).count(),0);
  assert.match(await coluna(p,'Negociação').locator('.crm-hf-total').innerText(),/Valor: R\$\s19\.000,00/);assert.match(await coluna(p,'Contrato').locator('.crm-hf-total').innerText(),/Valor: R\$\s31\.000,00/);
  assert.equal(await p.locator('section[aria-label="Follow Up prioritário"]').count(),0,'a coluna Follow Up é só do perfil Comercial');
  assert.equal(await p.getByRole('button',{name:'Cadastrar lead',exact:true}).count(),1);assert.equal(await p.getByRole('alert').count(),0);
  const c=cartao(p,'Morador Teste');for(const n of ['Editar Morador Teste','Agendar FollowUp · Morador Teste','Avançar Morador Teste para Negociação'])await c.getByRole('button',{name:n,exact:true}).waitFor();
  assert.equal(await c.locator('.crm-lead-lixeira').count(),0,'lixeira só em lead');assert.equal(await cartao(p,'Lead de demonstração').locator('.crm-lead-lixeira').count(),1);assert.equal(await c.getByRole('button',{name:/Salvar negociação/}).count(),0);
  assert.equal(await cartao(p,'Cliente Hoje').getByRole('button',{name:'Avançar Cliente Hoje para Cliente ativo',exact:true}).count(),1);});
 await passo('Funil: status antigos aparecem na etapa certa e nenhum cartão do funil some',async()=>{
  const esperado={'Cliente Status Novo':'Cliente novo','Cliente Contato Feito':'Cliente novo','Cliente Status Vazio':'Cliente novo','Cliente Status Estranho':'Cliente novo','Lead Sem Responsavel':'Cliente novo','Cliente da Bia':'Cliente novo','Cliente Proposta':'Negociação','Cliente Atrasado':'Negociação','Lead Negociacao':'Negociação','Cliente Hoje':'Contrato','Cliente Contrato SemCPF':'Contrato'};
  for(const [n,e] of Object.entries(esperado))assert.equal(await coluna(p,e).locator('article.crm-hf-cartao').filter({has:p.getByRole('button',{name:`Abrir ficha de ${n}`,exact:true})}).count(),1,`${n} em ${e}`);
  assert.match(await cartao(p,'Cliente Status Estranho').innerText(),/Etapa "Legado X" tratada como Cliente novo/);assert.match(await cartao(p,'Cliente Status Vazio').innerText(),/Sem etapa definida/);assert.match(await cartao(p,'Cliente Contrato SemCPF').innerText(),/Sem CPF/);
  assert.match(await cartao(p,'Lead Negociacao').innerText(),/Sem município/);assert.match(await cartao(p,'Cliente Valor Sem Forma').innerText(),/R\$\s900,00/);assert.match(await cartao(p,'Cliente Proposta').innerText(),/R\$\s2\.000,00/);
  assert.match(await cartao(p,'Lead Negociacao').innerText(),/Amanhã/);assert.match(await cartao(p,'Cliente Hoje').innerText(),/Hoje/);assert.match(await cartao(p,'Cliente Atrasado').innerText(),/Atrasado há 2 dias/);
  assert.equal(await p.locator('article.crm-hf-cartao').count(),14);});
 await passo('Funil: Clientes ativos e Perdidos mostram os cartões que não são coluna (grafias antigas incluídas)',async()=>{
  const s=p.getByText(/^Clientes ativos \(1\)$/);await s.click();await p.getByRole('button',{name:'Abrir ficha de Cliente Ativo Antigo',exact:true}).waitFor();assert.equal(await p.locator('article.crm-cliente-card').filter({hasText:'Cliente Ativo Antigo'}).count(),0);await s.click();
  await aba(p,'Perdidos').click();await p.getByRole('button',{name:'Abrir ficha de Cliente Perdido Antigo',exact:true}).waitFor();
  await aba(p,'Potenciais leads').click();for(const n of ['Lead de demonstração','Lead Negociacao','Lead Sem Responsavel'])await p.getByRole('button',{name:`Abrir ficha de ${n}`,exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Abrir ficha de Morador Teste',exact:true}).count(),0);
  await p.getByRole('button',{name:'Comerciais responsáveis (0)',exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Cadastrar lead',exact:true}).count(),1);await aba(p,'Funil comercial').click();});
 await passo('Funil: abrir a ficha lateral (dialog único, gaveta à direita, Fechar ficha e Esc)',async()=>{
  await cartao(p,'Morador Teste').getByRole('button',{name:'Abrir ficha de Morador Teste',exact:true}).click();const d=p.getByRole('dialog');await d.waitFor();assert.equal(await d.count(),1);
  assert.equal(await d.getAttribute('aria-label'),'Ficha de Morador Teste');assert.equal(await d.evaluate(e=>e.matches(':modal')),true);assert.ok(await d.evaluate(e=>e.classList.contains('crm-ficha-lateral')));
  const box=await d.boundingBox();assert.ok(box.width<=561,`largura ${box.width}`);assert.ok(Math.abs(box.x+box.width-1440)<2,'colada à direita');assert.ok(box.height>=990,`altura ${box.height}`);
  await d.getByText('Etapa: Cliente novo').waitFor();assert.equal(await d.getByLabel('Status',{exact:true}).count(),1);assert.equal(await d.getByLabel('Status',{exact:true}).inputValue(),'Cliente novo');
  for(const n of ['Editar dados','Registrar atendimento','Registrar tarefa','Fechar ficha'])await d.getByRole('button',{name:n,exact:true}).waitFor();await d.getByRole('form',{name:'Negociação de Morador Teste'}).waitFor();await d.getByText('Opções do cliente',{exact:true}).click();
  for(const n of ['Transferir','Abrir cadastro'])await d.getByRole('button',{name:n,exact:true}).waitFor();assert.equal(await d.getByRole('button',{name:/^Comerciais responsáveis/}).count(),0,'cliente não tem Comerciais responsáveis');
  await d.getByText(/Dados do cliente/).first().waitFor();await d.getByText('Município teste').first().waitFor();
  await d.getByRole('button',{name:'Fechar ficha',exact:true}).click();await d.waitFor({state:'detached'});
  await cartao(p,'Morador Teste').getByRole('button',{name:'Abrir ficha de Morador Teste',exact:true}).click();await d.waitFor();await p.keyboard.press('Escape');await d.waitFor({state:'detached'});
  await cartao(p,'Lead de demonstração').getByRole('button',{name:'Abrir ficha de Lead de demonstração',exact:true}).click();await d.waitFor();await d.getByText(/Falta completar: .*Sem município/).waitFor();await d.getByRole('button',{name:'Comerciais responsáveis (1)',exact:true}).waitFor();
  await d.getByText('Opções do cliente',{exact:true}).click();await d.getByRole('button',{name:'Confirmar cadastro do contato',exact:true}).waitFor();await d.getByRole('button',{name:'Fechar ficha',exact:true}).click();await d.waitFor({state:'detached'});assert.equal((await gravacoes(p)).length,0);});
 await passo('Funil: lápis Editar e lixeira do cartão enxuto abrem os diálogos de sempre, sem gravar',async()=>{
  await cartao(p,'Lead de demonstração').getByRole('button',{name:'Editar Lead de demonstração',exact:true}).click();let d=p.getByRole('dialog');await d.getByRole('form',{name:'Editar Lead de demonstração'}).waitFor();assert.equal(await d.count(),1);await d.getByRole('button',{name:'Fechar cadastro',exact:true}).click();await d.waitFor({state:'detached'});
  await cartao(p,'Lead de demonstração').getByRole('button',{name:'Excluir e arquivar Lead de demonstração',exact:true}).click();d=p.getByRole('dialog');assert.equal(await d.getByRole('button',{name:'Excluir e guardar no arquivo'}).isDisabled(),true);await d.getByRole('button',{name:'Fechar cadastro',exact:true}).click();await d.waitFor({state:'detached'});assert.equal((await gravacoes(p)).length,0);});
 await passo('Ficha lateral: a tabulação segue a ordem visual, alvos de 40 px, texto de 13 px ou mais e rótulos com contraste (claro)',async()=>{
  await p.setViewportSize({width:1440,height:2400});await cartao(p,'Morador Teste').getByRole('button',{name:'Abrir ficha de Morador Teste',exact:true}).click();const d=p.getByRole('dialog');await d.waitFor();
  await d.getByText('Opções do cliente',{exact:true}).click();await d.getByText(/^Histórico de FollowUp/).click();await d.getByRole('button',{name:'Registrar atendimento',exact:true}).click();await p.waitForTimeout(250);
  const m=await medirFicha(p);assert.ok(m.total>=10,'controles encontrados: '+m.total);
  assert.deepEqual(m.ordem,[],'a ordem do DOM é a que o olho vê');assert.deepEqual(m.pequenos,[]);assert.deepEqual(m.fontes,[]);assert.deepEqual(m.contrastes,[]);
  const ordemDom=await d.evaluate(e=>{const a=e.querySelector('aside'),dados=[...e.querySelectorAll('.crm-ficha-painel')].find(x=>x.querySelector('h3')?.textContent==='Dados do cliente');return !!(a&&dados&&(a.compareDocumentPosition(dados)&Node.DOCUMENT_POSITION_FOLLOWING));});assert.equal(ordemDom,true,'o painel Registros e status vem antes de Dados do cliente no DOM');
  await d.getByRole('button',{name:'Fechar ficha',exact:true}).focus();await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Status','o primeiro foco depois de Fechar ficha é o Status, no topo da gaveta');
  await d.getByRole('button',{name:'Fechar ficha',exact:true}).click();await d.waitFor({state:'detached'});await p.setViewportSize({width:1440,height:1000});
  const apoio=await p.evaluate(()=>[...document.querySelectorAll('.crm-visoes>span,.crm-pagina>p.ajuda')].map(e=>parseFloat(getComputedStyle(e).fontSize)));assert.ok(apoio.length>=2&&apoio.every(f=>f>=13),'visualização e ajuda da aba: '+apoio);assert.equal((await gravacoes(p)).length,0);});
 await passo('Avançar que falta dado NÃO grava e abre a ficha: lead para Contrato, Contrato sem CPF e valor sem forma',async()=>{
  const antes=await cartoesFixture(p);let d=p.getByRole('dialog');
  await limpar(p);await cartao(p,'Lead Negociacao').getByRole('button',{name:'Avançar Lead Negociacao para Contrato',exact:true}).click();await d.waitFor();assert.equal(await d.getByLabel('Status',{exact:true}).inputValue(),'Contrato');await d.getByText('Alterações ainda não salvas.').waitFor();await d.getByText('Para levar este lead a Contrato, confirme o município e a remessa na ficha.').waitFor();
  assert.ok(await d.getByRole('button',{name:/Usar remessa mais recente/}).count()||await d.getByLabel(/Município/).count(),'o formulário da ficha pede município e remessa');assert.equal((await gravacoes(p)).length,0);assert.equal(await cartoesFixture(p),antes);await d.getByRole('button',{name:'Fechar ficha',exact:true}).click();await d.waitFor({state:'detached'});
  await cartao(p,'Cliente Contrato SemCPF').getByRole('button',{name:'Avançar Cliente Contrato SemCPF para Cliente ativo',exact:true}).click();await d.waitFor();await d.getByText('Este cliente está sem CPF. Confira os dados na ficha antes de salvar a etapa.').waitFor();assert.equal(await d.getByLabel('Status',{exact:true}).inputValue(),'Cliente ativo');assert.equal((await gravacoes(p)).length,0);await d.getByRole('button',{name:'Fechar ficha',exact:true}).click();await d.waitFor({state:'detached'});
  await cartao(p,'Cliente Valor Sem Forma').getByRole('button',{name:'Avançar Cliente Valor Sem Forma para Negociação',exact:true}).click();await d.waitFor();await d.getByRole('status').filter({hasText:'Escolha a forma de negociação.'}).waitFor();assert.equal(await d.getByLabel('Status',{exact:true}).inputValue(),'Negociação');assert.equal((await gravacoes(p)).length,0);await d.getByRole('button',{name:'Fechar ficha',exact:true}).click();await d.waitFor({state:'detached'});
  assert.equal(await cartoesFixture(p),antes,'nenhum dado do fixture mudou');assert.equal((await gravacoes(p)).length,0);});
 await passo('Avançar com dados completos grava só o status, sem atualização otimista e com o botão travado enquanto grava',async()=>{
  const antes=JSON.parse(await cartoesFixture(p)).find(c=>c.id===id(200));await limpar(p);await p.evaluate(()=>{window.atrasoPatch=1200;});
  const c=cartao(p,'Morador Teste');await c.getByRole('button',{name:'Avançar Morador Teste para Negociação',exact:true}).click();
  await p.waitForFunction(()=>window.escritas.some(e=>e.m==='PATCH'));assert.equal(await c.getByRole('button',{name:'Avançar Morador Teste para Negociação',exact:true}).isDisabled(),true,'travado enquanto grava');
  assert.equal(await coluna(p,'Cliente novo').locator('article.crm-hf-cartao').filter({hasText:'Morador Teste'}).count(),1,'o cartão não muda de coluna antes de a gravação voltar');
  await coluna(p,'Negociação').locator('article.crm-hf-cartao').filter({hasText:'Morador Teste'}).waitFor();await p.getByText('Morador Teste foi para Negociação.',{exact:true}).waitFor();await p.evaluate(()=>{window.atrasoPatch=0;});
  const pa=await patches(p);assert.equal(pa.length,1);assert.deepEqual(JSON.parse(pa[0].b),{status:'Negociação'});assert.match(pa[0].u,new RegExp(`id=eq\\.${id(200)}`));
  const depois=JSON.parse(await cartoesFixture(p)).find(c=>c.id===id(200));assert.equal(depois.status,'Negociação');assert.deepEqual({...depois,status:antes.status},antes,'só o status mudou');assert.equal((await gravacoes(p)).length,1);});
 await passo('Avançar de Contrato para Cliente ativo pede confirmação inline; Cancelar e Esc não gravam',async()=>{
  await limpar(p);const c=cartao(p,'Cliente Hoje'),avancar=c.getByRole('button',{name:'Avançar Cliente Hoje para Cliente ativo',exact:true});
  await avancar.click();const g=c.getByRole('group',{name:'Confirmar ativação'});await g.waitFor();await g.getByText('Cliente Hoje passará a Cliente ativo e sairá do funil. A ativação fica registrada nos relatórios. Confirmar?').waitFor();
  assert.equal(await p.evaluate(()=>document.activeElement?.textContent),'Confirmar ativação');await g.getByRole('button',{name:'Cancelar',exact:true}).click();await g.waitFor({state:'detached'});assert.equal((await gravacoes(p)).length,0);assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Avançar Cliente Hoje para Cliente ativo');
  await avancar.click();await g.waitFor();await p.keyboard.press('Escape');await g.waitFor({state:'detached'});assert.equal((await gravacoes(p)).length,0);});
 await passo('Falha ao gravar: o erro padrão aparece e o cartão continua na mesma coluna',async()=>{
  const antes=await cartoesFixture(p);await limpar(p);await p.evaluate(()=>{window.falharPatch=true;});
  await cartao(p,'Cliente Status Novo').getByRole('button',{name:'Avançar Cliente Status Novo para Negociação',exact:true}).click();const al=p.getByRole('alert');await al.waitFor();assert.match(await al.innerText(),/Falha simulada/);
  assert.equal(await coluna(p,'Cliente novo').locator('article.crm-hf-cartao').filter({hasText:'Cliente Status Novo'}).count(),1);assert.equal(await cartoesFixture(p),antes,'nada foi alterado');await p.evaluate(()=>{window.falharPatch=false;});
  await al.getByRole('button',{name:'Tentar novamente',exact:true}).click();await al.waitFor({state:'detached'});});
 await passo('Avançar Contrato para Cliente ativo confirmado grava, avisa e tira o cartão das colunas',async()=>{
  await limpar(p);const c=cartao(p,'Cliente Hoje');await c.getByRole('button',{name:'Avançar Cliente Hoje para Cliente ativo',exact:true}).click();await c.getByRole('group',{name:'Confirmar ativação'}).getByRole('button',{name:'Confirmar ativação',exact:true}).click();
  await p.getByText('Cliente Hoje passou a Cliente ativo e saiu do funil. O registro fica nos relatórios de clientes ativados.',{exact:true}).waitFor();const pa=await patches(p);assert.equal(pa.length,1);assert.equal(JSON.parse(pa[0].b).status,'Cliente ativo');
  assert.equal(await cartao(p,'Cliente Hoje').count(),0);assert.equal(await p.getByRole('heading',{name:/^Cliente ativo · /}).count(),0);await p.getByText(/^Clientes ativos \(2\)$/).click();await p.getByRole('button',{name:'Abrir ficha de Cliente Hoje',exact:true}).waitFor();await p.getByText(/^Clientes ativos \(2\)$/).click();});
 await passo('Arrastar o cartão para outra etapa grava só o status; a coluna de destino é destacada',async()=>{
  await limpar(p);const origem=cartao(p,'Lead de demonstração'),destino=coluna(p,'Negociação');await arrastar(p,origem,destino,{soltar:false});assert.equal(await destino.getAttribute('data-alvo'),'true');await soltarArraste(p);
  await p.waitForFunction(()=>window.escritas.some(e=>e.m==='PATCH'),null,{timeout:8000});const pa=await patches(p);assert.equal(pa.length,1);assert.deepEqual(JSON.parse(pa[0].b),{status:'Negociação'});await destino.locator('article.crm-hf-cartao').filter({hasText:'Lead de demonstração'}).waitFor();assert.equal(await destino.getAttribute('data-alvo'),null);});
 await passo('Arrastar para uma etapa anterior grava (mesma função e validação do Status da ficha) e mantém os valores da negociação',async()=>{
  await limpar(p);const antes=JSON.parse(await cartoesFixture(p)).find(c=>c.id===id(918));await arrastar(p,cartao(p,'Cliente Proposta'),coluna(p,'Cliente novo'));
  await p.waitForFunction(()=>window.escritas.some(e=>e.m==='PATCH'),null,{timeout:8000});const pa=await patches(p);assert.equal(pa.length,1);assert.deepEqual(JSON.parse(pa[0].b),{status:'Cliente novo'});
  await coluna(p,'Cliente novo').locator('article.crm-hf-cartao').filter({hasText:'Cliente Proposta'}).waitFor();const depois=JSON.parse(await cartoesFixture(p)).find(c=>c.id===id(918));assert.deepEqual({...depois,status:antes.status},antes);});
 await passo('Arrastar lead para Contrato NÃO grava: abre a ficha com a etapa; mesma coluna e fora das colunas não fazem nada',async()=>{
  const antes=await cartoesFixture(p);await limpar(p);await arrastar(p,cartao(p,'Lead Negociacao'),coluna(p,'Contrato'));const d=p.getByRole('dialog');await d.waitFor();assert.equal(await d.getByLabel('Status',{exact:true}).inputValue(),'Contrato');assert.equal((await gravacoes(p)).length,0);assert.equal(await cartoesFixture(p),antes);await d.getByRole('button',{name:'Fechar ficha',exact:true}).click();await d.waitFor({state:'detached'});
  await arrastar(p,cartao(p,'Lead Negociacao'),coluna(p,'Negociação'));await p.waitForTimeout(500);assert.equal((await gravacoes(p)).length,0);assert.equal(await p.getByRole('dialog').count(),0);assert.equal(await cartoesFixture(p),antes);});
 await passo('Visões Semi e Detalhada mantêm o cartão completo e a preferência continua gravada na chave de sempre',async()=>{
  await p.getByRole('button',{name:'Semi',exact:true}).click();await p.getByRole('form',{name:'Negociação de Cliente Atrasado'}).first().waitFor();assert.equal(await p.locator('article.crm-hf-cartao').count(),0);
  await p.getByRole('button',{name:'Detalhada',exact:true}).click();assert.equal(await p.getByRole('button',{name:'Detalhada',exact:true}).getAttribute('aria-pressed'),'true');const chave=await p.evaluate(()=>Object.keys(localStorage).find(k=>k.startsWith('integracao-crm-visao-v1:')));assert.ok(chave);assert.equal(await p.evaluate(k=>localStorage.getItem(k),chave),'detalhada');
  const f=p.getByRole('form',{name:'Negociação de Cliente Atrasado'}).first();await f.getByLabel('Valor total (R$)',{exact:true}).fill('13.000,00');await p.getByRole('button',{name:'Reduzido',exact:true}).click();await p.getByText('Há uma negociação em edição. Salve ou descarte antes de trocar a visualização.').waitFor();assert.equal(await p.getByRole('button',{name:'Detalhada',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await f.getByLabel('Valor total (R$)',{exact:true}).inputValue(),'13.000,00');
  await f.getByLabel('Valor total (R$)',{exact:true}).fill('12.000,00');await p.getByRole('button',{name:'Reduzido',exact:true}).click();await p.locator('article.crm-hf-cartao').first().waitFor();assert.equal(await p.evaluate(k=>localStorage.getItem(k),chave),'reduzido');});
 await passo('sem erro de página no funil',async()=>{assert.deepEqual(p.erros,[]);});
 const chaveVisao=await p.evaluate(()=>Object.keys(localStorage).find(k=>k.startsWith('integracao-crm-visao-v1:')));await p.close();
 // ---------- 3. Preferência de visão já salva ----------
 for(const [valor,esperado] of [['semi','Semi'],['detalhada','Detalhada'],['xyz','Reduzido']]){
  p=await abrir(b,{dados:false,preferencia:[chaveVisao,valor]});await aba(p,'Funil comercial').click();
  await passo(`preferência salva "${valor}" continua lida (valor inválido cai em Reduzido) e nunca é apagada`,async()=>{assert.equal(await p.getByRole('button',{name:esperado,exact:true}).getAttribute('aria-pressed'),'true');if(valor==='xyz')await p.locator('article.crm-hf-cartao').first().waitFor();else await p.getByRole('form',{name:'Negociação de Morador Teste'}).first().waitFor();assert.equal(await p.evaluate(k=>localStorage.getItem(k),chaveVisao),valor);});
  await p.close();}
 // ---------- 4. Cadastros existentes sem cartão (somente leitura, só administração) ----------
 const cadastros=[
  {registro_id:'r-1',referencia_id:'c-1',nome:'Cadastro Novo Antigo',telefone:'47900000001',status_crm:'Novo',situacao:'Ativo',municipioId:null,codigo:'A1',arquivamento:null},
  {registro_id:'r-2',referencia_id:'c-2',nome:'Cadastro Proposta',telefone:'',status_crm:'Proposta enviada',situacao:'Ativo',municipioId:null,codigo:'A2',arquivamento:null},
  {registro_id:'r-3',referencia_id:'c-3',nome:'Cadastro Contrato',telefone:'47900000003',status_crm:'Contrato',situacao:'Ativo',municipioId:null,codigo:'A3',arquivamento:null},
  {registro_id:'r-4',referencia_id:'c-4',nome:'Cadastro Cliente Ativo',telefone:'47900000004',status_crm:'Cliente Ativo',situacao:'Ativo',municipioId:null,codigo:'A4',arquivamento:null},
  {registro_id:'r-5',referencia_id:'c-5',nome:'Cadastro Perdido',telefone:'47900000005',status_crm:'Perdido',situacao:'Ativo',municipioId:null,codigo:'A5',arquivamento:null},
  {registro_id:'r-6',referencia_id:'c-6',nome:'Cadastro Sem Status',telefone:'47900000006',status_crm:'',situacao:'Ativo',municipioId:null,codigo:'A6',arquivamento:null},
  {registro_id:'r-7',referencia_id:'c-7',nome:'Cadastro Cancelado',telefone:'47900000007',status_crm:'Negociação',situacao:'Cancelado',municipioId:null,codigo:'A7',arquivamento:null},
  {registro_id:'r-8',referencia_id:'c-8',nome:'Cadastro Arquivado',telefone:'47900000008',status_crm:'Negociação',situacao:'Ativo',municipioId:null,codigo:'A8',arquivamento:{ativo:true}},
  {registro_id:'r-9',referencia_id:'c-9',nome:'Cadastro Texto Livre',telefone:'47900000009',status_crm:'Em contato',situacao:'Ativo',municipioId:null,codigo:'A9',arquivamento:null},
  {registro_id:'r-10',referencia_id:id(4),nome:'Cadastro Com Cartao',telefone:'',status_crm:'Contrato',situacao:'Ativo',municipioId:null,codigo:'A10',arquivamento:null}];
 // fin_receb_clientes (somente leitura, sem CPF): quem já tem cartão ou complemento não duplica; o arquivado continua fora; só o financeiro entra sem etapa.
 const clientesFin=[
  {id:id(4),nome:'Morador Teste',codigo:'TST01_001',municipio_id:id(2),ativo:true},
  {id:'c-1',nome:'Cadastro Novo Antigo',codigo:'A1',municipio_id:id(2),ativo:true},
  {id:'c-8',nome:'Cadastro Arquivado',codigo:'A8',municipio_id:id(2),ativo:true},
  {id:'fin-1',nome:'Cliente So Financeiro',codigo:'F1',municipio_id:id(2),ativo:true},
  {id:'fin-2',nome:'Cliente Financeiro Inativo',codigo:'F2',municipio_id:id(2),ativo:false}];
 p=await abrir(b,{cadastros,clientes:clientesFin});await aba(p,'Funil comercial').click();
 await passo('Cadastros sem cartão: aparecem recolhidos dentro da etapa correta e ficam fora dos totais da coluna',async()=>{
  const n=async e=>Number((await coluna(p,e).getByText(/^Cadastros sem cartão \(\d+\)$/).innerText()).match(/\d+/)[0]);
  assert.equal(await n('Cliente novo'),4,'Novo, sem status, texto livre e só financeiro');assert.equal(await n('Negociação'),1);assert.equal(await n('Contrato'),1);
  for(const t of ['Cliente novo · 9','Negociação · 3','Contrato · 2'])await p.getByRole('heading',{name:t,exact:true}).waitFor();assert.match(await coluna(p,'Contrato').locator('.crm-hf-total').innerText(),/Valor: R\$\s31\.000,00/);
  assert.equal(await p.getByRole('button',{name:/^Abrir cadastro de /}).count(),0,'recolhido: nada no DOM');
  await coluna(p,'Cliente novo').getByText(/^Cadastros sem cartão/).click();for(const nome of ['Cadastro Novo Antigo','Cadastro Sem Status','Cadastro Texto Livre','Cliente So Financeiro'])await coluna(p,'Cliente novo').getByRole('button',{name:`Abrir cadastro de ${nome}`,exact:true}).waitFor();
  await coluna(p,'Cliente novo').getByText('Status do cadastro: "Em contato"').waitFor();await coluna(p,'Cliente novo').getByText(/Cadastro existente no Integração, ainda sem cartão no CRM/).waitFor();
  await coluna(p,'Negociação').getByText(/^Cadastros sem cartão/).click();await coluna(p,'Negociação').getByRole('button',{name:'Abrir cadastro de Cadastro Proposta',exact:true}).waitFor();assert.match(await coluna(p,'Negociação').locator('.crm-hf-ativo').filter({hasText:'Cadastro Proposta'}).innerText(),/Sem telefone/);
  assert.equal(await p.locator('article.crm-cliente-card').filter({hasText:/Cadastro (Novo Antigo|Proposta|Contrato|Cliente Ativo|Perdido|Sem Status|Cancelado|Arquivado|Texto Livre|Com Cartao)/}).count(),0,'cadastro não vira cartão');});
 await passo('Cadastros ativo, perdido e inativo têm lugar visível; arquivado e cadastro com cartão não duplicam',async()=>{
  await p.getByText(/^Clientes ativos \(2\)$/).click();await p.getByRole('button',{name:'Abrir cadastro de Cadastro Cliente Ativo',exact:true}).waitFor();await p.getByRole('button',{name:'Abrir ficha de Cliente Ativo Antigo',exact:true}).waitFor();
  await p.getByText(/^Cadastros inativos ou cancelados \(2\)$/).click();await p.getByRole('button',{name:'Abrir cadastro de Cadastro Cancelado',exact:true}).waitFor();await p.getByRole('button',{name:'Abrir cadastro de Cliente Financeiro Inativo',exact:true}).waitFor();
  for(const n of ['Cadastro Arquivado','Cadastro Com Cartao'])assert.equal(await p.getByRole('button',{name:`Abrir cadastro de ${n}`,exact:true}).count(),0,n);
  await aba(p,'Perdidos').click();await p.getByRole('heading',{name:'Cadastros sem cartão marcados como perdidos (1)',exact:true}).waitFor();await p.getByRole('button',{name:'Abrir cadastro de Cadastro Perdido',exact:true}).waitFor();await p.getByRole('button',{name:'Abrir ficha de Cliente Perdido Antigo',exact:true}).waitFor();});
 await passo('Cliente que só existe no financeiro aparece em Cliente novo com pendências discretas, sem duplicar cartão, complemento nem arquivado',async()=>{
  await aba(p,'Funil comercial').click();const col=coluna(p,'Cliente novo'),so=col.locator('.crm-hf-ativo').filter({hasText:'Cliente So Financeiro'});
  await col.getByText(/^Cadastros sem cartão \(4\)$/).click();await so.waitFor();assert.match(await so.innerText(),/Código F1/);assert.match(await so.innerText(),/Sem telefone/);assert.match(await so.innerText(),/Sem etapa definida/);assert.equal(await so.getByRole('button',{name:'Abrir cadastro de Cliente So Financeiro',exact:true}).count(),1);
  assert.equal(await p.getByRole('button',{name:'Abrir cadastro de Morador Teste',exact:true}).count(),0,'quem tem cartão não duplica');assert.equal(await p.getByRole('button',{name:'Abrir cadastro de Cadastro Novo Antigo',exact:true}).count(),1,'quem tem complemento aparece uma vez');
  assert.equal(await p.getByRole('button',{name:'Abrir cadastro de Cadastro Arquivado',exact:true}).count(),0,'arquivado continua fora');assert.equal(await p.locator('article.crm-cliente-card').filter({hasText:'Cliente So Financeiro'}).count(),0,'cadastro não vira cartão');
  await p.getByLabel('Buscar no CRM').fill('financeiro');await col.getByText('Cadastros sem cartão (1)').waitFor();await p.getByLabel('Buscar no CRM').fill('');});
 await passo('Divergência cartão x cadastro vira pendência no cartão, e a busca e o filtro de comercial valem para os cadastros',async()=>{
  await aba(p,'Funil comercial').click();await cartao(p,'Morador Teste').getByText('Cadastro marca "Contrato"').waitFor();
  await p.getByLabel('Buscar no CRM').fill('proposta');await coluna(p,'Negociação').getByText('Cadastros sem cartão (1)').waitFor();await cartao(p,'Cliente Proposta').waitFor();await p.getByLabel('Buscar no CRM').fill('');
  await p.getByLabel('Filtrar comercial',{exact:true}).selectOption({label:'Ana Comercial'});await coluna(p,'Cliente novo').getByRole('heading',{name:/^Cliente novo · \d+$/}).waitFor();assert.equal(await p.getByText(/^Cadastros sem cartão/).count(),0,'cadastro não tem responsável');await p.getByLabel('Filtrar comercial',{exact:true}).selectOption('');});
 await passo('Ler cadastros não grava nada',async()=>{assert.equal((await gravacoes(p)).length,0);const lidos=(await p.evaluate(()=>window.leituras)).filter(u=>u.includes('fin_receb_clientes?select')&&u.includes('ativo'));assert.ok(lidos.length>0,'administração lê o financeiro');assert.ok(lidos.every(u=>u.includes('select=id%2Cnome%2Ccodigo%2Cmunicipio_id%2Cativo')&&!/cpf/i.test(u)),'só colunas sem CPF: '+lidos.join(' | '));assert.ok((await p.evaluate(()=>window.leituras)).some(u=>u.includes('integracao_moradores?select')&&u.includes('status_crm')),'administração lê os cadastros');assert.deepEqual(p.erros,[]);});
 await p.close();
 // ---------- 5. Falha na leitura dos cadastros e perfil Comercial ----------
 p=await abrir(b,{dados:false,cadastros:null});await aba(p,'Funil comercial').click();
 await passo('Leitura de cadastros sem retorno não quebra a tela nem cria alerta',async()=>{await cartao(p,'Morador Teste').waitFor();assert.equal(await p.getByRole('alert').count(),0);});
 await p.close();
 p=await abrir(b,{query:'&agentecomercial',dados:false,cadastros});
 await passo('Comercial: Hoje com o FollowUp vencido, sem Dashboard, Arquivo nem filtro de comercial, e nunca lê cadastros',async()=>{
  await p.getByRole('heading',{name:/^Você tem \d+ contatos? para resolver$/}).waitFor();await linha(p,'Morador Teste').getByRole('button',{name:'Registrar FollowUp feito · Morador Teste',exact:true}).waitFor();
  for(const n of ['Dashboard comercial','Arquivo do CRM'])assert.equal(await p.getByRole('button',{name:n,exact:true}).count(),0,n);assert.equal(await p.getByLabel('Filtrar comercial',{exact:true}).count(),0);
  await aba(p,'Funil comercial').click();const f=p.locator('section[aria-label="Follow Up prioritário"]');await f.getByRole('heading',{name:'Follow Up · 1',exact:true}).waitFor();await f.getByRole('button',{name:'Abrir ficha de Morador Teste',exact:true}).waitFor();
  assert.equal(await p.getByText(/^Cadastros sem cartão/).count(),0);assert.equal((await p.evaluate(()=>window.leituras)).filter(u=>(u.includes('integracao_moradores?select')&&u.includes('status_crm'))||(u.includes('fin_receb_clientes?select')&&u.includes('ativo'))).length,0,'Comercial não consulta os cadastros');assert.equal((await gravacoes(p)).length,0);assert.deepEqual(p.erros,[]);});
 await p.close();
 // Cliente ativo que aparece na coluna Follow Up (FollowUp nas próximas 24h): arrastar para uma etapa aberta desfaria a ativação, então só abre a ficha.
 p=await abrir(b,{query:'&agentecomercial',dados:false,ativoComFollowup:true});await aba(p,'Funil comercial').click();
 await passo('Comercial: Cliente ativo na coluna Follow Up não grava ao arrastar; abre a ficha com a etapa escolhida e só Salvar grava',async()=>{
  const f=p.locator('section[aria-label="Follow Up prioritário"]');await f.getByRole('heading',{name:'Follow Up · 2',exact:true}).waitFor();
  const origem=f.locator('article.crm-hf-cartao').filter({has:p.getByRole('button',{name:'Abrir ficha de Cliente Ativo Com FollowUp',exact:true})});await origem.waitFor();
  assert.equal(await origem.getAttribute('data-etapa'),'Cliente ativo');assert.equal(await origem.getByRole('button',{name:/^Avançar /}).count(),0,'um ativo não tem Avançar');
  const antes=await cartoesFixture(p);await limpar(p);await arrastar(p,origem,coluna(p,'Cliente novo'));
  const d=p.getByRole('dialog');await d.waitFor();assert.equal(await d.getAttribute('aria-label'),'Ficha de Cliente Ativo Com FollowUp');
  await d.getByText('Este cliente está em Cliente ativo. Para mudar a etapa, confira o Status na ficha e salve.').waitFor();assert.equal(await d.getByLabel('Status',{exact:true}).inputValue(),'Cliente novo');await d.getByText('Alterações ainda não salvas.').waitFor();
  assert.equal((await gravacoes(p)).length,0);assert.equal((await patches(p)).length,0);assert.equal(await cartoesFixture(p),antes,'nenhum dado do fixture mudou');
  await d.getByRole('button',{name:'Fechar ficha',exact:true}).click();await d.waitFor({state:'detached'});
  await arrastar(p,origem,coluna(p,'Contrato'));await d.waitFor();assert.equal(await d.getByLabel('Status',{exact:true}).inputValue(),'Contrato');await d.getByRole('button',{name:'Fechar ficha',exact:true}).click();await d.waitFor({state:'detached'});
  assert.equal((await gravacoes(p)).length,0);assert.equal(await cartoesFixture(p),antes);assert.deepEqual(p.erros,[]);});
 await p.close();
 // ---------- 6. Alternador CRM Reurb / CRM Institucional ----------
 p=await abrir(b,{dados:false});
 await passo('Alternador: CRM Institucional embute o módulo de sempre e esconde busca, abas, visões e Cadastrar lead; CRM Reurb volta',async()=>{
  const alt=p.getByRole('group',{name:'Tipo de cliente'});assert.equal(await alt.getByRole('button',{name:'CRM Reurb',exact:true}).getAttribute('aria-pressed'),'true');
  await alt.getByRole('button',{name:'CRM Institucional',exact:true}).click();assert.equal(await alt.getByRole('button',{name:'CRM Institucional',exact:true}).getAttribute('aria-pressed'),'true');await p.getByRole('button',{name:'Cadastrar institucional',exact:true}).waitFor();
  assert.equal(await p.getByRole('button',{name:'Cadastrar lead',exact:true}).count(),0);assert.equal(await p.getByRole('group',{name:'Seções do CRM'}).count(),0);assert.equal(await p.getByRole('group',{name:'Visualização do funil'}).count(),0);for(const n of ['Buscar no CRM','Filtrar comercial'])assert.equal(await p.getByLabel(n,{exact:true}).count(),0,n);
  assert.equal(await p.getByRole('button',{name:'Clientes institucionais',exact:true}).count(),0);assert.equal(await p.getByRole('navigation').count(),1);await p.getByText('Configurar agentes do Chatwoot',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Cadastrar institucional',exact:true}).click();const d=p.getByRole('dialog');await d.getByLabel('Nome do cliente',{exact:true}).fill('Prefeitura de Teste');await d.getByLabel('Contato',{exact:true}).fill('Maria, Secretaria de Obras');await d.getByLabel('Produto ou serviço',{exact:true}).fill('Levantamento topográfico');await d.getByLabel('Valor (R$)',{exact:true}).fill('12500.50');await d.getByLabel('Comercial responsável',{exact:true}).selectOption({label:'Ana Comercial'});await d.getByLabel('Prazo inicial de FollowUp',{exact:true}).selectOption('4');
  const clientes=await p.evaluate(()=>window.baseFixture.fin_receb_clientes.length);await d.getByRole('button',{name:'Cadastrar cliente institucional',exact:true}).click();await p.getByText('Negócio institucional salvo.',{exact:true}).waitFor();await p.locator('.crm-institucional-card').getByRole('heading',{name:'Prefeitura de Teste'}).waitFor();assert.equal(await p.evaluate(()=>window.baseFixture.fin_receb_clientes.length),clientes,'institucional não cria cliente');assert.equal(await p.evaluate(()=>window.baseFixture.integracao_crm_institucionais.length),1);
  await alt.getByRole('button',{name:'CRM Reurb',exact:true}).click();await p.getByRole('button',{name:'Cadastrar lead',exact:true}).waitFor();await p.getByRole('group',{name:'Seções do CRM'}).waitFor();assert.equal(await p.locator('.crm-institucional-card').count(),0);assert.deepEqual(p.erros,[]);});
 await p.close();
 // ---------- 7. Dashboard comercial (administração) ----------
 p=await abrir(b);await aba(p,'Dashboard comercial').click();
 await passo('Dashboard: filtros, períodos rápidos, comparativo, situação e funil de hoje, detalhe por comercial e relatório de ativados',async()=>{
  await p.getByRole('heading',{name:'Dashboard comercial'}).waitFor();await p.locator('.crm-dashboard-agente').first().waitFor();assert.equal(await p.locator('.crm-dashboard:not(.crm-ativacoes)').count(),1);assert.equal(await p.locator('section.crm-ativacoes').count(),1);assert.equal(await p.getByRole('button',{name:'Cadastrar lead',exact:true}).count(),1);
  for(const n of ['Atualizar indicadores','Conferir histórico no Chatwoot'])await p.getByRole('button',{name:n,exact:true}).waitFor();const per=p.getByRole('group',{name:'Períodos rápidos'});
  for(const n of ['Este mês','Mês anterior','Últimos 30 dias','Últimos 90 dias','Este ano'])await per.getByRole('button',{name:n,exact:true}).waitFor();assert.equal(await per.getByRole('button',{name:'Este mês',exact:true}).getAttribute('aria-pressed'),'true');
  await limpar(p);await per.getByRole('button',{name:'Mês anterior',exact:true}).click();assert.equal(await per.getByRole('button',{name:'Mês anterior',exact:true}).getAttribute('aria-pressed'),'true');
  await p.getByText('Período: 01/09/2026 a 30/09/2026. Comparado com 02/08/2026 a 31/08/2026.',{exact:true}).waitFor();
  const corpos=(await escritas(p)).filter(e=>e.u.includes('integracao_crm_dashboard')).map(e=>JSON.parse(e.b));assert.ok(corpos.some(c=>c.p_inicio==='2026-09-01'&&c.p_fim==='2026-09-30'),'período atual');assert.ok(corpos.some(c=>c.p_inicio==='2026-08-02'&&c.p_fim==='2026-08-31'),'período anterior com a mesma duração');
  const kpi=p.locator('.crm-dash-kpis > div').filter({hasText:'Conversões em contrato'});assert.match(await kpi.innerText(),/2/);assert.match(await kpi.innerText(),/Igual ao período anterior \(2\)/);
  const hoje=p.getByRole('table',{name:'Carteira em andamento por comercial'});assert.match(await hoje.locator('tr').filter({hasText:'Ana Comercial'}).innerText(),/Ana Comercial\s+12\s+1\s+9/);assert.match(await hoje.locator('tfoot').innerText(),/Total\s+14\s+1\s+11[\s\S]*R\$\s50\.900,00/);
  const funil={'Cliente novo':9,'Negociação':3,'Contrato':2,'Cliente ativo':1,'Perdido':1};for(const [e,n] of Object.entries(funil)){const li=p.locator(`li.crm-dash-etapa[data-etapa="${e}"]`);assert.match(await li.innerText(),new RegExp(`${n}\\s+clientes?`));await li.getByRole('img',{name:new RegExp(`^${e}: ${n} de 9$`)}).waitFor();}
  const sel=p.getByLabel('Comercial do dashboard');assert.equal(await p.locator('.crm-dashboard-agente').count(),2);await sel.selectOption({label:'Bia Comercial'});assert.equal(await p.locator('.crm-dashboard-agente').count(),1);await p.getByText(/Mostrando só os cartões de Bia Comercial/).first().waitFor();assert.match(await p.locator('li.crm-dash-etapa[data-etapa="Cliente novo"]').innerText(),/1\s+cliente/);await sel.selectOption('');assert.equal(await p.locator('.crm-dashboard-agente').count(),2);
  assert.match(await p.locator('.crm-dashboard-agente').filter({hasText:'Ana Comercial'}).innerText(),/Clientes na carteira[\s\S]*Atendimentos manuais/);
  const rel=p.locator('section.crm-ativacoes');await rel.getByRole('button',{name:'Exportar planilha',exact:true}).waitFor();await rel.getByLabel('Relatório').waitFor();await limpar(p);await p.getByRole('button',{name:'Atualizar indicadores',exact:true}).click();await p.waitForFunction(()=>window.escritas.filter(e=>e.u.includes('integracao_crm_dashboard')).length>=2);assert.equal((await gravacoes(p)).filter(e=>!e.u.includes('/rpc/')).length,0,'Atualizar indicadores só lê');});
 await passo('Dashboard: Ver carteira de um comercial leva à aba Hoje já filtrada',async()=>{
  await p.getByRole('button',{name:'Ver carteira de Ana Comercial',exact:true}).click();assert.equal(await abaHoje(p).getAttribute('aria-current'),'true');
  assert.equal(await p.getByLabel('Filtrar comercial',{exact:true}).evaluate(s=>s.selectedOptions[0].textContent),'Ana Comercial');await linha(p,'Morador Teste').waitFor();assert.equal(await linha(p,'Cliente da Bia').count(),0);});
 await passo('Metas: a aba abre e o botão Cadastrar lead some como antes',async()=>{await aba(p,'Metas').click();assert.equal(await p.getByRole('button',{name:'Cadastrar lead',exact:true}).count(),0);assert.equal(await aba(p,'Metas').getAttribute('aria-current'),'true');await abaHoje(p).click();await p.getByRole('button',{name:'Cadastrar lead',exact:true}).waitFor();assert.deepEqual(p.erros,[]);});
 await p.close();
 // ---------- 8. Tema escuro (1440 px) ----------
 p=await abrir(b);await p.evaluate(()=>document.querySelector('.rb').classList.add('escuro'));
 await passo('Tema escuro: linhas, cartões e ficha não ficam com fundo branco e a página não rola na horizontal',async()=>{
  const fundo=s=>p.locator(s).first().evaluate(e=>getComputedStyle(e).backgroundColor);
  await p.locator('.crm-hf-linha').first().waitFor();assert.notEqual(await fundo('.crm-hf-linha'),'rgb(255, 255, 255)');await semRolagem(p,'hoje escuro');
  await aba(p,'Funil comercial').click();await p.locator('.crm-hf-cartao').first().waitFor();assert.notEqual(await fundo('.crm-hf-cartao'),'rgb(255, 255, 255)');assert.notEqual(await fundo('.crm-hf-coluna'),'rgb(255, 255, 255)');
  await cartao(p,'Morador Teste').getByRole('button',{name:'Abrir ficha de Morador Teste',exact:true}).click();await p.getByRole('dialog').waitFor();assert.notEqual(await fundo('dialog[open]'),'rgb(255, 255, 255)');assert.notEqual(await fundo('dialog[open] .crm-ficha-painel'),'rgb(255, 255, 255)');
  await p.getByRole('dialog').getByRole('button',{name:'Fechar ficha',exact:true}).click();assert.deepEqual(p.erros,[]);});
 await p.close();
 // ---------- 9. 390 px: sem rolagem horizontal da página ----------
 p=await abrir(b,{largura:390,altura:844});
 await passo('390 px: Hoje, alternador e abas sem rolagem horizontal da página e com alvos de 40 px',async()=>{
  await p.getByRole('heading',{name:'Você tem 2 contatos para resolver',exact:true}).waitFor();await semRolagem(p,'hoje');assert.deepEqual(await alvosPequenos(p),[]);
  const faixa=await p.locator('.crm-abas').evaluate(e=>({sw:e.scrollWidth,cw:e.clientWidth}));assert.ok(faixa.sw>=faixa.cw);await aba(p,'Dashboard comercial').waitFor();await p.getByRole('group',{name:'Tipo de cliente'}).getByRole('button',{name:'CRM Institucional',exact:true}).waitFor();});
 await passo('390 px: Funil, Potenciais leads, Perdidos e Tarefas sem rolagem horizontal da página; o quadro rola por dentro',async()=>{
  await aba(p,'Funil comercial').click();await cartao(p,'Morador Teste').waitFor();await semRolagem(p,'funil');assert.deepEqual(await alvosPequenos(p),[]);const quadro=await p.locator('.crm-hf-quadro').evaluate(e=>({sw:e.scrollWidth,cw:e.clientWidth,ox:getComputedStyle(e).overflowX}));assert.ok(quadro.sw>quadro.cw&&/auto|scroll/.test(quadro.ox),JSON.stringify(quadro));
  await aba(p,'Potenciais leads').click();await p.getByRole('button',{name:'Abrir ficha de Lead de demonstração',exact:true}).waitFor();await semRolagem(p,'leads');await aba(p,'Perdidos').click();await p.getByRole('button',{name:'Abrir ficha de Cliente Perdido Antigo',exact:true}).waitFor();await semRolagem(p,'perdidos');await aba(p,'Tarefas abertas').click();await p.getByRole('heading',{name:'Atrasadas · 1',exact:true}).waitFor();await semRolagem(p,'tarefas');});
 await passo('390 px: a ficha vira folha inferior sem rolagem horizontal',async()=>{
  await aba(p,'Funil comercial').click();await cartao(p,'Morador Teste').getByRole('button',{name:'Abrir ficha de Morador Teste',exact:true}).click();const d=p.getByRole('dialog');await d.waitFor();const box=await d.boundingBox();assert.ok(box.width>=389,`largura ${box.width}`);assert.ok(Math.abs(box.y+box.height-844)<2,`encostada embaixo ${JSON.stringify(box)}`);assert.ok(box.height<=0.93*844,`altura ${box.height}`);assert.equal(await d.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);await semRolagem(p,'ficha');
  await d.getByRole('button',{name:'Fechar ficha',exact:true}).click();await d.waitFor({state:'detached'});});
 await passo('390 px: Dashboard, Institucional e Metas sem rolagem horizontal da página',async()=>{
  await aba(p,'Dashboard comercial').click();await p.locator('.crm-dashboard-agente').first().waitFor();await semRolagem(p,'dashboard');await p.locator('section.crm-ativacoes').scrollIntoViewIfNeeded();await semRolagem(p,'ativados');
  await aba(p,'Metas').click();await p.waitForTimeout(300);await semRolagem(p,'metas');await p.getByRole('group',{name:'Tipo de cliente'}).getByRole('button',{name:'CRM Institucional',exact:true}).click();await p.getByRole('button',{name:'Cadastrar institucional',exact:true}).waitFor();await semRolagem(p,'institucional');assert.deepEqual(p.erros,[]);});
 await p.close();
 console.log('CRM Hoje, funil enxuto, ficha lateral, alternador, Dashboard e 390 px: OK');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
