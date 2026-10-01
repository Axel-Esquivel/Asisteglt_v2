import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { provideAsisteGltCore } from '@asisteglt/web-core';
import { App } from './app';

describe('App', () => {
  beforeEach(async (): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideAsisteGltCore('/api/v1', null)],
    }).compileComponents();
  });

  it('muestra la marca y el botón de menú', async (): Promise<void> => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element: unknown = fixture.nativeElement;
    expect(element).toBeInstanceOf(HTMLElement);
    if (element instanceof HTMLElement) {
      expect(element.textContent).toContain('AsisteGLT');
      expect(element.querySelector('[aria-label="Abrir menú"]')).not.toBeNull();
    }
  });
});
