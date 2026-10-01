import { Page, expect } from '@playwright/test';

/** Usuario de prueba único por ejecución. */
export class TestUser {
  private static counter: number = 0;

  public constructor(
    public readonly displayName: string,
    public readonly email: string,
    public readonly password: string,
  ) {}

  public static unique(prefix: string): TestUser {
    TestUser.counter += 1;
    const stamp: string = `${String(Date.now())}${String(TestUser.counter)}${String(Math.floor(Math.random() * 1000))}`;
    return new TestUser(`${prefix} Demo`, `${prefix.toLowerCase()}.${stamp}@demo.test`, 'ClaveSegura2026');
  }

  public async register(page: Page): Promise<void> {
    await page.goto('/auth/register');
    await page.getByLabel('Nombre').fill(this.displayName);
    await page.getByLabel('Correo electrónico').fill(this.email);
    await page.locator('#password').fill(this.password);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByRole('heading', { name: `Hola, ${this.displayName}` })).toBeVisible();
  }

  public async login(page: Page): Promise<void> {
    await page.goto('/auth/login');
    await page.getByLabel('Correo electrónico').fill(this.email);
    await page.locator('#password').fill(this.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('heading', { name: `Hola, ${this.displayName}` })).toBeVisible();
  }
}
