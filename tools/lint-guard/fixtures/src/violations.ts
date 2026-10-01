// Archivo con violaciones intencionales: tools/lint-guard/check.mjs verifica que el lint las detecte.
import { Component } from '@angular/material/core';

export interface WithOptional {
  name?: string;
}

export function looseValue(input: any): string | undefined {
  return input?.name;
}

export class Holder {
  public value!: string;
  public read(raw: unknown): string {
    return raw as string;
  }
}

export const nothing = undefined;
export const unused = Component;
