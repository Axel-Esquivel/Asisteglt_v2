import { AbstractControl } from '@angular/forms';
import { Nullable } from '@asisteglt/shared-kernel';

/**
 * Mensajes de validación de los formularios de proyecto (nombre y descripción).
 * Un control informa su error cuando el usuario sale del campo o intenta enviar el formulario.
 */
export class ProjectFormErrors {
  public static readonly NAME_MIN: number = 3;
  public static readonly NAME_MAX: number = 120;
  public static readonly DESCRIPTION_MAX: number = 1000;

  public static nameError(control: AbstractControl<string>): Nullable<string> {
    if (!ProjectFormErrors.visible(control)) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Escribe un nombre para el proyecto.';
    }
    if (control.hasError('minlength')) {
      return `El nombre debe tener al menos ${String(ProjectFormErrors.NAME_MIN)} caracteres.`;
    }
    if (control.hasError('maxlength')) {
      return `El nombre admite como máximo ${String(ProjectFormErrors.NAME_MAX)} caracteres.`;
    }
    return null;
  }

  public static descriptionError(control: AbstractControl<string>): Nullable<string> {
    if (!ProjectFormErrors.visible(control)) {
      return null;
    }
    if (control.hasError('maxlength')) {
      return `La descripción admite como máximo ${String(ProjectFormErrors.DESCRIPTION_MAX)} caracteres.`;
    }
    return null;
  }

  private static visible(control: AbstractControl<string>): boolean {
    return control.invalid && control.touched;
  }
}
