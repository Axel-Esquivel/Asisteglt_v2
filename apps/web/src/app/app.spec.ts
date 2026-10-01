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

  it('monta el router-outlet raíz y el toast global', async (): Promise<void> => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element: unknown = fixture.nativeElement;
    expect(element).toBeInstanceOf(HTMLElement);
    if (element instanceof HTMLElement) {
      expect(element.querySelector('router-outlet')).not.toBeNull();
      expect(element.querySelector('p-toast')).not.toBeNull();
    }
  });
});
