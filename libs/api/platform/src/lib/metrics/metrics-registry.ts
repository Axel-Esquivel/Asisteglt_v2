import { Nullable } from '@asisteglt/shared-kernel';

/** Etiquetas de una serie (valores de baja cardinalidad: rutas con parámetros, no ids). */
export type MetricLabels = Readonly<Record<string, string>>;

/** Una línea de exposición: sufijo del nombre, etiquetas y valor. */
class MetricSample {
  public constructor(
    public readonly suffix: string,
    public readonly labels: MetricLabels,
    public readonly value: number,
  ) {}
}

/** Métrica con nombre y ayuda; cada tipo sabe producir sus muestras. */
export abstract class Metric {
  protected constructor(
    public readonly name: string,
    public readonly help: string,
  ) {}

  public abstract type(): string;

  public abstract samples(): ReadonlyArray<MetricSample>;

  /** Copia con las etiquetas en orden alfabético: la misma serie siempre se escribe igual. */
  protected static normalize(labels: MetricLabels): MetricLabels {
    return Object.fromEntries(
      Object.keys(labels)
        .sort()
        .map((name: string): [string, string] => [name, labels[name] ?? '']),
    );
  }

  protected static key(labels: MetricLabels): string {
    return JSON.stringify(
      Object.keys(labels)
        .sort()
        .map((name: string): [string, string] => [name, labels[name] ?? '']),
    );
  }
}

/** Contador monótono por combinación de etiquetas. */
export class Counter extends Metric {
  private readonly series: Map<string, MetricSample> = new Map<string, MetricSample>();

  public constructor(name: string, help: string) {
    super(name, help);
  }

  public type(): string {
    return 'counter';
  }

  public inc(labels: MetricLabels): void {
    this.add(labels, 1);
  }

  public add(labels: MetricLabels, amount: number): void {
    if (amount < 0) {
      throw new Error(`El contador ${this.name} no puede disminuir`);
    }
    const key: string = Metric.key(labels);
    this.series.set(key, new MetricSample('', Metric.normalize(labels), this.valueAt(key) + amount));
  }

  public value(labels: MetricLabels): number {
    return this.valueAt(Metric.key(labels));
  }

  private valueAt(key: string): number {
    const sample: Nullable<MetricSample> = this.series.get(key) ?? null;
    return sample === null ? 0 : sample.value;
  }

  public samples(): ReadonlyArray<MetricSample> {
    return [...this.series.values()];
  }
}

/** Valor instantáneo leído en cada exposición (conexiones abiertas, memoria, etc.). */
export class Gauge extends Metric {
  public constructor(
    name: string,
    help: string,
    private readonly labels: MetricLabels,
    private readonly read: () => number,
  ) {
    super(name, help);
  }

  public type(): string {
    return 'gauge';
  }

  public samples(): ReadonlyArray<MetricSample> {
    return [new MetricSample('', Metric.normalize(this.labels), this.read())];
  }
}

/** Histograma acumulado con cubetas fijas (en segundos para duraciones). */
export class Histogram extends Metric {
  private readonly series: Map<string, HistogramSeries> = new Map<string, HistogramSeries>();

  public constructor(
    name: string,
    help: string,
    private readonly buckets: ReadonlyArray<number>,
  ) {
    super(name, help);
  }

  public type(): string {
    return 'histogram';
  }

  public observe(labels: MetricLabels, value: number): void {
    const key: string = Metric.key(labels);
    const series: HistogramSeries =
      this.series.get(key) ?? new HistogramSeries(Metric.normalize(labels), this.buckets.length);
    series.observe(this.buckets, value);
    this.series.set(key, series);
  }

  public samples(): ReadonlyArray<MetricSample> {
    return [...this.series.values()].flatMap((series: HistogramSeries): MetricSample[] =>
      series.samples(this.buckets),
    );
  }
}

class HistogramSeries {
  private readonly counts: number[];
  private sum: number = 0;
  private total: number = 0;

  public constructor(
    private readonly labels: MetricLabels,
    bucketCount: number,
  ) {
    this.counts = new Array<number>(bucketCount).fill(0);
  }

  public observe(buckets: ReadonlyArray<number>, value: number): void {
    buckets.forEach((bound: number, index: number): void => {
      if (value <= bound) {
        this.counts[index] = (this.counts[index] ?? 0) + 1;
      }
    });
    this.sum += value;
    this.total += 1;
  }

  public samples(buckets: ReadonlyArray<number>): MetricSample[] {
    const bucketSamples: MetricSample[] = buckets.map(
      (bound: number, index: number): MetricSample =>
        new MetricSample('_bucket', { ...this.labels, le: String(bound) }, this.counts[index] ?? 0),
    );
    return [
      ...bucketSamples,
      new MetricSample('_bucket', { ...this.labels, le: '+Inf' }, this.total),
      new MetricSample('_sum', this.labels, this.sum),
      new MetricSample('_count', this.labels, this.total),
    ];
  }
}

/**
 * Registro de métricas de la aplicación con exposición en el formato de texto de Prometheus
 * (versión 0.0.4). Los nombres se registran una sola vez; volver a pedirlos devuelve la misma
 * instancia para que varios componentes compartan una serie.
 */
export class MetricsRegistry {
  public static readonly CONTENT_TYPE: string = 'text/plain; version=0.0.4; charset=utf-8';
  /** Cubetas por defecto para latencias HTTP, en segundos. */
  public static readonly LATENCY_BUCKETS: ReadonlyArray<number> = [
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
  ];

  private readonly metrics: Map<string, Metric> = new Map<string, Metric>();

  public counter(name: string, help: string): Counter {
    const existing: Nullable<Metric> = this.metrics.get(name) ?? null;
    if (existing instanceof Counter) {
      return existing;
    }
    return this.register(new Counter(name, help));
  }

  public histogram(name: string, help: string, buckets: ReadonlyArray<number>): Histogram {
    const existing: Nullable<Metric> = this.metrics.get(name) ?? null;
    if (existing instanceof Histogram) {
      return existing;
    }
    return this.register(new Histogram(name, help, buckets));
  }

  /** Registra (o reemplaza) un indicador que se lee al exponer. */
  public gauge(name: string, help: string, read: () => number): Gauge {
    const gauge: Gauge = new Gauge(name, help, {}, read);
    this.metrics.set(name, gauge);
    return gauge;
  }

  /** Serie informativa con valor 1 (p. ej. la versión desplegada en una etiqueta). */
  public info(name: string, help: string, labels: MetricLabels): Gauge {
    const gauge: Gauge = new Gauge(name, help, labels, (): number => 1);
    this.metrics.set(name, gauge);
    return gauge;
  }

  public render(): string {
    const lines: string[] = [];
    for (const metric of this.metrics.values()) {
      lines.push(`# HELP ${metric.name} ${MetricsRegistry.escapeHelp(metric.help)}`);
      lines.push(`# TYPE ${metric.name} ${metric.type()}`);
      for (const sample of metric.samples()) {
        lines.push(
          `${metric.name}${sample.suffix}${MetricsRegistry.labels(sample.labels)} ${MetricsRegistry.number(sample.value)}`,
        );
      }
    }
    return `${lines.join('\n')}\n`;
  }

  private register<T extends Metric>(metric: T): T {
    if (this.metrics.has(metric.name)) {
      throw new Error(`La métrica ${metric.name} ya existe con otro tipo`);
    }
    this.metrics.set(metric.name, metric);
    return metric;
  }

  private static labels(labels: MetricLabels): string {
    const entries: string[] = Object.keys(labels).map(
      (name: string): string => `${name}="${MetricsRegistry.escapeValue(labels[name] ?? '')}"`,
    );
    return entries.length === 0 ? '' : `{${entries.join(',')}}`;
  }

  private static number(value: number): string {
    if (Number.isNaN(value)) {
      return 'NaN';
    }
    if (!Number.isFinite(value)) {
      return value > 0 ? '+Inf' : '-Inf';
    }
    return String(value);
  }

  private static escapeValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
  }

  private static escapeHelp(help: string): string {
    return help.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
  }
}
