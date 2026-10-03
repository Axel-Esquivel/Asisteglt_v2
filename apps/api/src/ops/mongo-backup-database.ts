import { mongo } from 'mongoose';
import { BackupError } from './backup-archive';
import { BackupDatabase, EjsonDocument, IndexDefinition } from './backup-ports';

/** Base MongoDB (o compatible) leída y escrita con el controlador oficial en EJSON canónico. */
export class MongoBackupDatabase extends BackupDatabase {
  private static readonly NAMESPACE_NOT_FOUND: number = 26;
  private static readonly NAMESPACE_EXISTS: number = 48;

  private constructor(
    private readonly client: mongo.MongoClient,
    private readonly db: mongo.Db,
  ) {
    super();
  }

  public static async connect(uri: string): Promise<MongoBackupDatabase> {
    const client: mongo.MongoClient = new mongo.MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    return new MongoBackupDatabase(client, client.db());
  }

  public databaseName(): string {
    return this.db.databaseName;
  }

  public override async collections(): Promise<string[]> {
    const infos: Array<{ name: string }> = await this.db
      .listCollections({ type: 'collection' }, { nameOnly: true })
      .toArray();
    return infos
      .map((info: { name: string }): string => info.name)
      .filter((name: string): boolean => !name.startsWith('system.'));
  }

  public override count(collection: string): Promise<number> {
    return this.db.collection(collection).countDocuments({});
  }

  public override async indexes(collection: string): Promise<IndexDefinition[]> {
    const raw: unknown[] = await this.db.collection(collection).listIndexes().toArray();
    return raw
      .map((index: unknown): IndexDefinition => MongoBackupDatabase.index(index))
      .filter((index: IndexDefinition): boolean => index.name !== '_id_');
  }

  public override async *documents(collection: string): AsyncGenerator<EjsonDocument> {
    for await (const document of this.db.collection(collection).find({})) {
      yield mongo.BSON.EJSON.stringify(document, { relaxed: false });
    }
  }

  public override async drop(collection: string): Promise<void> {
    try {
      await this.db.collection(collection).drop();
    } catch (error: unknown) {
      if (
        !(error instanceof mongo.MongoServerError) ||
        error.code !== MongoBackupDatabase.NAMESPACE_NOT_FOUND
      ) {
        throw error;
      }
    }
  }

  public override async ensureCollection(collection: string): Promise<void> {
    try {
      await this.db.createCollection(collection);
    } catch (error: unknown) {
      if (!(error instanceof mongo.MongoServerError) || error.code !== MongoBackupDatabase.NAMESPACE_EXISTS) {
        throw error;
      }
    }
  }

  public override async insert(collection: string, documents: ReadonlyArray<EjsonDocument>): Promise<void> {
    const parsed: mongo.Document[] = documents.map((text: EjsonDocument): mongo.Document => {
      const value: unknown = mongo.BSON.EJSON.parse(text, { relaxed: false });
      if (!MongoBackupDatabase.isDocument(value)) {
        throw new BackupError(`Documento inválido en la colección ${collection}`);
      }
      return value;
    });
    await this.db.collection(collection).insertMany(parsed, { ordered: true });
  }

  public override async createIndexes(
    collection: string,
    indexes: ReadonlyArray<IndexDefinition>,
  ): Promise<void> {
    await this.db.command({
      createIndexes: collection,
      indexes: indexes.map((index: IndexDefinition): mongo.Document => ({
        ...index.options,
        key: index.key,
        name: index.name,
      })),
    });
  }

  public override async close(): Promise<void> {
    await this.client.close();
  }

  private static index(raw: unknown): IndexDefinition {
    if (!MongoBackupDatabase.isDocument(raw)) {
      throw new BackupError('Índice con formato inesperado');
    }
    const name: unknown = raw['name'];
    const key: unknown = raw['key'];
    if (typeof name !== 'string' || !MongoBackupDatabase.isDocument(key)) {
      throw new BackupError('Índice con formato inesperado');
    }
    const options: Record<string, unknown> = {};
    for (const [option, value] of Object.entries(raw)) {
      if (option !== 'name' && option !== 'key' && option !== 'v' && option !== 'ns') {
        options[option] = value;
      }
    }
    return { name, key: { ...key }, options };
  }

  private static isDocument(value: unknown): value is mongo.Document {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
