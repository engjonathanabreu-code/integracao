begin;
create or replace function integracao_crm_privado.pode_editar_oficios() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and ativo and (
 tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Projeto','Projetos','Jurídico') or tipo like 'Diretor %' or setor in ('Projeto','Projetos','Jurídico')
 ));
$$;
revoke all on function integracao_crm_privado.pode_editar_oficios() from public,anon;
grant execute on function integracao_crm_privado.pode_editar_oficios() to authenticated;
alter policy oficios_arquivo_criar on storage.objects with check(bucket_id='integracao-oficios' and integracao_crm_privado.pode_editar_oficios() and split_part(name,'/',1)=auth.uid()::text);
create or replace function integracao_crm_privado.oficio_operar(p_acao text,p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r public.integracao_oficios;ano_v integer;numero_v integer;ultimo_v integer;pedido uuid;dia date;caminho_v text;
begin
 if u is null or not exists(select 1 from public.profiles where id=u and ativo) then raise exception 'Sessão ativa obrigatória';end if;
 if not integracao_crm_privado.pode_editar_oficios() then raise exception 'Sem permissão para cadastrar ofícios';end if;
 if p_acao='resumo' then
 update public.integracao_oficios set resumo=p_dados->>'resumo',resumo_status=p_dados->>'resumo_status',atualizado_em=clock_timestamp() where id=(p_dados->>'id')::uuid returning * into r;
 if not found then raise exception 'Ofício não encontrado';end if;return to_jsonb(r);
 elsif p_acao<>'registrar' then raise exception 'Ação inválida';end if;
 pedido:=(p_dados->>'pedido')::uuid;
 if pedido is null then raise exception 'Identificador obrigatório';end if;
 -- Idempotência por pedido, inclusive quando o retorno anterior não chegou ao aparelho.
 perform pg_advisory_xact_lock(hashtextextended('oficio-pedido:'||pedido::text,0));
 select * into r from public.integracao_oficios where id=pedido;
 if found then if r.autor<>u then raise exception 'Pedido inválido';end if;return to_jsonb(r);end if;
 dia:=(p_dados->>'data_envio')::date;ano_v:=extract(year from dia)::integer;
 if dia is null or ano_v not between 2000 and 2199 or dia>(clock_timestamp() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe a data em que o ofício foi enviado';end if;
 caminho_v:=p_dados->>'caminho';
 if split_part(caminho_v,'/',1)<>u::text or split_part(caminho_v,'/',2)<>pedido::text or not exists(select 1 from storage.objects where bucket_id='integracao-oficios' and name=caminho_v) then raise exception 'Envie o arquivo antes de registrar o ofício';end if;
 if exists(select 1 from public.integracao_oficios where sha256=p_dados->>'sha256') then raise exception 'Este arquivo já está cadastrado no controle de ofícios';end if;
 perform pg_advisory_xact_lock(hashtextextended('oficios-ano:'||ano_v::text,0));
 select ultimo into ultimo_v from public.integracao_oficios_sequencias where ano=ano_v;
 numero_v:=(p_dados->>'numero')::integer;
 if ultimo_v is null then
 if numero_v is null or numero_v not between 1 and 999999 then raise exception 'Confirme o número do primeiro ofício deste ano';end if;
 insert into public.integracao_oficios_sequencias values(ano_v,numero_v);
 else
 if numero_v is distinct from ultimo_v+1 then raise exception 'A sequência foi atualizada. Confira o próximo número antes de salvar';end if;
 update public.integracao_oficios_sequencias set ultimo=numero_v where ano=ano_v;
 end if;
 insert into public.integracao_oficios(id,ano,numero,prefeitura,assunto,data_envio,caminho,nome_arquivo,mime,tamanho,sha256,resumo,resumo_status,autor)
 values(pedido,ano_v,numero_v,p_dados->>'prefeitura',p_dados->>'assunto',dia,caminho_v,p_dados->>'nome_arquivo',p_dados->>'mime',(p_dados->>'tamanho')::integer,p_dados->>'sha256',coalesce(p_dados->>'resumo',''),coalesce(p_dados->>'resumo_status','pendente'),u) returning * into r;
 return to_jsonb(r);
end $$;
notify pgrst,'reload schema';
commit;
