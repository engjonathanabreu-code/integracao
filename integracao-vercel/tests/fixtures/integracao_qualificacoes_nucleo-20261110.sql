CREATE OR REPLACE FUNCTION public.integracao_qualificacoes_nucleo(p_nucleo text, p_busca text DEFAULT ''::text, p_ids text[] DEFAULT NULL::text[], p_inicio integer DEFAULT 0, p_limite integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare n jsonb;res jsonb;
begin
 n:=integracao_documentos_privado.nucleo(p_nucleo);
 if p_limite not between 1 and 500 or p_inicio<0 or char_length(coalesce(p_busca,''))>200 or coalesce(cardinality(p_ids),0)>50000 then raise exception 'Parâmetros de consulta inválidos';end if;
 with candidatos as (
  select colecao,registro_id,dados,referencia_id,1 prioridade from public.integracao_moradores
  union all select colecao,registro_id,dados,referencia_id,2 from public.integracao_complementos
 ),atuais as (select distinct on(registro_id) * from candidatos where colecao='processos' order by registro_id,prioridade),
 vinculados as (select integracao_documentos_privado.morador(registro_id) p from atuais where (n->'aliases') ? (dados->>'nucleoId') and (p_ids is null or registro_id=any(p_ids))),
 filtrados as (select p from vinculados where p->>'municipioId'=n->>'municipioId' and (coalesce(p_busca,'')='' or strpos(integracao_documentos_privado.normalizar(coalesce(p->>'codigo','')||' '||coalesce(p#>>'{requerente,nome}','')),integracao_documentos_privado.normalizar(p_busca))>0)),
 pagina as (select p from filtrados order by p->>'codigo',p->>'id' limit p_limite offset p_inicio)
 select jsonb_build_object('items',coalesce((select jsonb_agg(p order by p->>'codigo',p->>'id') from pagina),'[]'),'total',(select count(*) from filtrados)) into res;
 return res;
end $function$
