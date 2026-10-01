import { OnApplicationShutdown } from '@nestjs/common';
import { Connection, createConnection } from 'mongoose';

/** Conexión de Mongoose compartida por los repositorios MongoDB. */
export class MongoDatabase implements OnApplicationShutdown {
  private constructor(public readonly connection: Connection) {}

  public static async connect(uri: string): Promise<MongoDatabase> {
    const connection: Connection = await createConnection(uri, {
      serverSelectionTimeoutMS: 10_000,
    }).asPromise();
    return new MongoDatabase(connection);
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }
}
