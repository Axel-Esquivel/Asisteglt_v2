import { Counter, Histogram, MetricsRegistry } from './metrics-registry';

describe('MetricsRegistry', () => {
  it('expone contadores, histogramas e indicadores en formato Prometheus', (): void => {
    const registry: MetricsRegistry = new MetricsRegistry();
    const requests: Counter = registry.counter('http_requests_total', 'Peticiones HTTP');
    requests.inc({ method: 'GET', status: '200' });
    requests.inc({ status: '200', method: 'GET' });
    requests.add({ method: 'POST', status: '500' }, 3);
    const latency: Histogram = registry.histogram('http_seconds', 'Latencia', [0.1, 1]);
    latency.observe({ route: '/a' }, 0.05);
    latency.observe({ route: '/a' }, 0.5);
    latency.observe({ route: '/a' }, 2);
    registry.gauge('open_connections', 'Conexiones "abiertas"\nahora', (): number => 7);
    registry.info('app_info', 'Versión', { version: '1.2.3' });

    const text: string = registry.render();

    expect(text).toContain('# TYPE http_requests_total counter');
    expect(text).toContain('http_requests_total{method="GET",status="200"} 2');
    expect(text).toContain('http_requests_total{method="POST",status="500"} 3');
    expect(text).toContain('http_seconds_bucket{route="/a",le="0.1"} 1');
    expect(text).toContain('http_seconds_bucket{route="/a",le="1"} 2');
    expect(text).toContain('http_seconds_bucket{route="/a",le="+Inf"} 3');
    expect(text).toContain('http_seconds_sum{route="/a"} 2.55');
    expect(text).toContain('http_seconds_count{route="/a"} 3');
    expect(text).toContain('# HELP open_connections Conexiones "abiertas"\\nahora');
    expect(text).toContain('open_connections 7');
    expect(text).toContain('app_info{version="1.2.3"} 1');
  });

  it('comparte la serie al pedir el mismo nombre y rechaza tipos distintos', (): void => {
    const registry: MetricsRegistry = new MetricsRegistry();
    registry.counter('eventos_total', 'Eventos').inc({ tipo: 'a' });
    registry.counter('eventos_total', 'Eventos').inc({ tipo: 'a' });
    expect(registry.counter('eventos_total', 'Eventos').value({ tipo: 'a' })).toBe(2);
    expect((): Histogram => registry.histogram('eventos_total', 'x', [1])).toThrow();
    expect((): void => registry.counter('c', 'c').add({}, -1)).toThrow();
  });

  it('escapa los valores de las etiquetas', (): void => {
    const registry: MetricsRegistry = new MetricsRegistry();
    registry.counter('x_total', 'x').inc({ path: 'a"b\\c' });
    expect(registry.render()).toContain('x_total{path="a\\"b\\\\c"} 1');
  });
});
