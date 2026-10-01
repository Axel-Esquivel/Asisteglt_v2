import { Browser, BrowserContext, Page, expect, test } from '@playwright/test';
import { TestUser } from './support/session';

interface Participant {
  readonly page: Page;
  readonly context: BrowserContext;
  readonly user: TestUser;
}

const join = async (browser: Browser, prefix: string): Promise<Participant> => {
  const context: BrowserContext = await browser.newContext();
  const page: Page = await context.newPage();
  const user: TestUser = TestUser.unique(prefix);
  await user.register(page);
  return { page, context, user };
};

const send = async (page: Page, text: string): Promise<void> => {
  await page.getByLabel('Mensaje', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Enviar' }).click();
};

test('mensajes directos en tiempo real con contador de no leídos', async ({ browser }): Promise<void> => {
  const ana: Participant = await join(browser, 'Anachat');
  const beto: Participant = await join(browser, 'Betochat');
  await beto.page.goto('/app/chat');
  await expect(beto.page.getByTestId('conversation-list')).toContainText('Chat general');

  await ana.page.goto('/app/chat');
  await ana.page.getByRole('button', { name: 'Nueva conversación' }).click();
  await ana.page.getByLabel('Busca a una persona por nombre o correo').fill(beto.user.email);
  await ana.page.getByRole('option', { name: new RegExp(beto.user.displayName) }).click();
  await expect(ana.page.getByRole('heading', { name: beto.user.displayName })).toBeVisible();
  await send(ana.page, 'Hola, ¿empezamos el conteo?');
  await expect(ana.page.getByTestId('chat-messages')).toContainText('Hola, ¿empezamos el conteo?');

  const item = beto.page.getByRole('link', { name: `${ana.user.displayName}, 1 sin leer` });
  await expect(item).toBeVisible();
  await item.click();
  await expect(beto.page.getByTestId('chat-messages')).toContainText('Hola, ¿empezamos el conteo?');
  await send(beto.page, 'Sí, en cinco minutos');
  await expect(ana.page.getByTestId('chat-messages')).toContainText('Sí, en cinco minutos');

  await ana.context.close();
  await beto.context.close();
});

test('chat general y edición de un mensaje propio', async ({ page }): Promise<void> => {
  await TestUser.unique('General').register(page);
  await page.goto('/app/chat');
  await page.getByRole('link', { name: /^Chat general/ }).click();
  await send(page, 'Mensaje original');
  await expect(page.getByTestId('chat-messages')).toContainText('Mensaje original');
  await page.getByRole('button', { name: 'Editar mensaje' }).last().click();
  await page.getByLabel('Mensaje', { exact: true }).fill('Mensaje corregido');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByTestId('chat-messages')).toContainText('Mensaje corregido');
  await expect(page.getByTestId('chat-messages')).toContainText('(editado)');
});
