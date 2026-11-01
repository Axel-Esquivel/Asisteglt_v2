import { FormControl, Validators } from '@angular/forms';
import { ProjectFormErrors } from './project-form-errors';

describe('ProjectFormErrors', () => {
  const nameControl = (value: string): FormControl<string> =>
    new FormControl<string>(value, {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(ProjectFormErrors.NAME_MIN),
        Validators.maxLength(ProjectFormErrors.NAME_MAX),
      ],
    });

  it('no muestra errores mientras el campo no se ha tocado', () => {
    expect(ProjectFormErrors.nameError(nameControl('ab'))).toBeNull();
  });

  it('explica por qué el nombre no es válido después de tocarlo', () => {
    const empty: FormControl<string> = nameControl('');
    empty.markAsTouched();
    expect(ProjectFormErrors.nameError(empty)).toBe('Escribe un nombre para el proyecto.');

    const short: FormControl<string> = nameControl('ab');
    short.markAsTouched();
    expect(ProjectFormErrors.nameError(short)).toBe('El nombre debe tener al menos 3 caracteres.');

    const long: FormControl<string> = nameControl('x'.repeat(121));
    long.markAsTouched();
    expect(ProjectFormErrors.nameError(long)).toBe('El nombre admite como máximo 120 caracteres.');
  });

  it('acepta un nombre válido y limita la descripción', () => {
    const valid: FormControl<string> = nameControl('Cierre ficticio');
    valid.markAsTouched();
    expect(ProjectFormErrors.nameError(valid)).toBeNull();

    const description: FormControl<string> = new FormControl<string>('x'.repeat(1001), {
      nonNullable: true,
      validators: [Validators.maxLength(ProjectFormErrors.DESCRIPTION_MAX)],
    });
    description.markAsTouched();
    expect(ProjectFormErrors.descriptionError(description)).toBe(
      'La descripción admite como máximo 1000 caracteres.',
    );
  });
});
