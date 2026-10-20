// Development-only, fully synthetic visual QA. Imported only by tests/browser.html.
export function instalarMoradoresFixture(base,id) {
  if(!new URLSearchParams(location.search).has('moradoresAjustes'))return null;
  const key='qa-moradores-ajustes-v1'+(new URLSearchParams(location.search).get('sequencia')||'');
  const saved=localStorage.getItem(key);
  if(saved)Object.assign(base,JSON.parse(saved));
  else {
    base.fin_receb_clientes[0].cpf_cnpj='52998224725';
    base.integracao_moradores.push({colecao:'processos',registro_id:id(4),referencia_tabela:'fin_receb_clientes',referencia_id:id(4),dados:{requerente:{estadoCivil:'Casado(a)'},conjuge:{nome:'Cônjuge Sintético Legado',cpf:'11144477735',beneficiario:'sim'},extras:{observacoesDocumental:'Observação sintética inicial'}}});
    const max=new URLSearchParams(location.search).get('sequencia');
    if(max)base.fin_receb_clientes.push({...base.fin_receb_clientes[0],id:id(988),codigo:`TST01_${max}`,nome:'Morador Sintético Sequência'});
  }
  const pdf=new File(['%PDF-1.4\nDocumento inteiramente sintético de homologação\n%%EOF'],'documento-sintetico.pdf',{type:'application/pdf'});
  const controls=document.createElement('aside');
  controls.id='qa-moradores';controls.style.cssText='position:fixed;bottom:45px;right:8px;z-index:99999;background:#fff4d1;color:#222;padding:8px;border:1px solid #a98621;font:12px sans-serif;max-width:250px';
  controls.innerHTML='<strong>QA local — dados sintéticos</strong><div draggable="true" id="qa-arrastar" style="padding:8px;border:1px dashed #777;margin:5px 0;cursor:grab">Arraste PDF sintético</div><button id="qa-soltar" type="button">Soltar PDF sintético na área</button><button id="qa-invalido" type="button">Soltar formato inválido</button><button id="qa-reabrir" type="button">Reabrir fixture salva</button><output id="qa-resultado" style="display:block"></output>';
  controls.querySelector('#qa-arrastar').ondragstart=e=>{e.dataTransfer.items.add(pdf);};
  const drop=file=>{const alvo=document.querySelector('.soltar-docs');if(!alvo)throw Error('Abra a guia Documentos');const dataTransfer=new DataTransfer();dataTransfer.items.add(file);alvo.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));};
  controls.querySelector('#qa-soltar').onclick=()=>drop(pdf);
  controls.querySelector('#qa-invalido').onclick=()=>drop(new File(['sintético'],'formato-invalido.exe',{type:'application/octet-stream'}));
  controls.querySelector('#qa-reabrir').onclick=()=>location.reload();
  document.body.append(controls);
  return {salvar(){localStorage.setItem(key,JSON.stringify(base));document.querySelector('#qa-resultado').textContent='Fixture sintética persistida.';}};
}
