import { CountEntryRequest, ItemCondition, WorkItemResponse } from '@asisteglt/shared-contracts';

/** Lo que el contador está escribiendo para un ítem: cantidad, novedad y comentario. */
export class EntryDraft {
  public constructor(
    public readonly quantity: string,
    public readonly condition: ItemCondition,
    public readonly comment: string,
  ) {}

  public static of(item: WorkItemResponse): EntryDraft {
    return new EntryDraft(item.counted ?? '', item.condition ?? ItemCondition.OK, '');
  }

  public withQuantity(quantity: string): EntryDraft {
    return new EntryDraft(quantity, this.condition, this.comment);
  }

  public withCondition(condition: ItemCondition): EntryDraft {
    return new EntryDraft(
      condition === ItemCondition.NOT_FOUND ? '0' : this.quantity,
      condition,
      this.comment,
    );
  }

  public withComment(comment: string): EntryDraft {
    return new EntryDraft(this.quantity, this.condition, comment);
  }

  /** «No está» no necesita cantidad (cuenta 0); lo demás sí. */
  public isComplete(): boolean {
    return this.condition === ItemCondition.NOT_FOUND || this.quantity.trim() !== '';
  }

  public toRequest(itemId: string): CountEntryRequest {
    return {
      itemId,
      quantity: this.condition === ItemCondition.NOT_FOUND ? '0' : this.quantity.trim(),
      comment: this.comment.trim(),
      condition: this.condition,
    };
  }
}
