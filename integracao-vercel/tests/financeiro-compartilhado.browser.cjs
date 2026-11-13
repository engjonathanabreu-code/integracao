const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

const origin = process.env.BROWSER_TEST_ORIGIN || 'http://127.0.0.1:5178';
const perfis = [
  { tipo: 'Financeiro', acesso: 'operar' },
  { tipo: 'Administrador', acesso: 'operar' },
  { tipo: 'Diretor Técnico', acesso: 'resumo', setor: 'Financeiro' },
  { tipo: 'Diretor de Projetos', acesso: 'resumo' },
  { tipo: 'Comercial' },
  { tipo: 'Topografia' },
  { tipo: 'Financeiro', inativo: true },
];

async function testarOperacao(page, tipo) {
  await page.getByRole('button', { name: 'Importar relatório de pagamentos', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Município teste', exact: false }).click();
  await page.locator('tbody button').first().click();
  await page.locator('tbody button').first().click();
  await page.getByRole('button', { name: /Morador Teste/ }).click();
  await page.getByRole('heading', { name: 'Financeiro do cliente' }).waitFor();
  await page.getByText('Parcela 1', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Editar parcela 1', exact: true }).waitFor();

  await page.getByRole('button', { name: 'Marcar pago', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar parcela', exact: true }).click();
  await page.getByRole('button', { name: 'Desmarcar pago', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.baseFixture.fin_receb_parcelas[0].valor_liquidado), 105);
  await page.evaluate(() => {
    const parcela = window.baseFixture.fin_receb_parcelas[0];
    parcela.status = 'Parcial';
    parcela.valor_liquidado = 50;
    window.simularRevisao('financeiro');
  });
  await page.locator('tbody td').filter({ hasText: /^Parcial/ }).waitFor();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Gerar relatório PDF', exact: true }).click();
  assert.match((await download).suggestedFilename(), /^financeiro-.*\.pdf$/);

  if (tipo === 'Financeiro') {
    const nav = page.locator('nav.nav');
    for (const name of ['Ajustes', 'Usuários']) {
      assert.equal(await nav.getByRole('button', { name, exact: true }).count(), 0);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    await nav.getByRole('button', { name: 'Financeiro', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('nav.nav').getBoundingClientRect().right <= 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
}

async function verificar() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const { tipo, setor, acesso, inativo } of perfis) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const query = new URLSearchParams({ financeiroTeste: tipo });
      if (setor) query.set('setorFinanceiroTeste', setor);
      if (inativo) query.set('financeiroInativo', 'true');
      await page.goto(origin + '/tests/browser.html?' + query);
      await page.getByLabel('E-mail', { exact: true }).fill('teste@example.invalid');
      await page.getByLabel('Senha', { exact: true }).fill('fixture');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      const nav = page.locator('nav.nav');
      const financeiro = nav.getByRole('button', { name: 'Financeiro', exact: true });
      if (inativo) {
        await page.getByText('Este usuário está inativo no ERP').waitFor();
      } else {
        await nav.getByRole('button', { name: 'Clientes', exact: true }).waitFor();
        if (!acesso) {
          assert.equal(await financeiro.count(), 0);
        } else {
          await financeiro.click();
          if (acesso === 'operar') {
            await testarOperacao(page, tipo);
          } else {
            const municipio = page.getByRole('row').filter({ hasText: 'Município teste' });
            await municipio.waitFor();
            assert.equal(await municipio.getByRole('button').count(), 0);
            assert.equal(await page.getByRole('button', { name: 'Importar relatório de pagamentos', exact: true }).count(), 0);
            assert.equal(await page.getByRole('button', { name: 'Rotina mensal', exact: true }).count(), 0);
          }
        }
      }
      if (acesso !== 'operar') {
        assert.equal(await page.evaluate(() => window.finRequests.some(url => /\/fin_receb_(parcelas|importacoes)$/.test(url))), false);
      }
      assert.deepEqual(errors, []);
      console.log(tipo + (inativo ? ' inativo' : '') + ' · ' + (acesso || 'sem acesso'));
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

verificar().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
